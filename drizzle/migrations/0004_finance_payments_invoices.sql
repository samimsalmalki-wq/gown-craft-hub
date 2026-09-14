-- ============ صلاحيات مالية: دالة فحص موحّدة ============
create or replace function private.can(_user_id uuid, _permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = 'admin'
  ) or exists (
    select 1 from public.user_permissions where user_id = _user_id and permission = _permission
  ) or exists (
    select 1
      from public.profiles p
      join public.role_permissions rp on rp.role_id = p.role_id
     where p.id = _user_id and rp.permission = _permission
  )
$$;

grant execute on function private.can(uuid, text) to authenticated;

-- ============ إعدادات الضريبة ============
create table public.tax_settings (
  id uuid primary key default gen_random_uuid(),
  vat_rate numeric(6,3) not null default 15,
  vat_enabled boolean not null default true,
  tax_number text,
  business_name text not null default 'مَعْمَل',
  business_address text,
  updated_at timestamptz not null default now()
);

grant select on public.tax_settings to authenticated;
grant insert, update on public.tax_settings to authenticated;
grant all on public.tax_settings to service_role;
alter table public.tax_settings enable row level security;

create policy "staff read tax settings" on public.tax_settings
  for select to authenticated using (private.is_staff(auth.uid()));
create policy "admin update tax settings" on public.tax_settings
  for update to authenticated using (private.has_role(auth.uid(), 'admin'));
create policy "admin insert tax settings" on public.tax_settings
  for insert to authenticated with check (private.has_role(auth.uid(), 'admin'));

create trigger tax_settings_touch before update on public.tax_settings
  for each row execute function public.touch_updated_at();

insert into public.tax_settings (vat_rate, vat_enabled) values (15, true);

-- ============ تسلسل الأرقام ============
create sequence public.finance_receipt_seq start 1;
create sequence public.finance_invoice_seq start 1;

-- ============ الدفعات وسندات القبض ============
create type public.payment_method as enum ('cash', 'card', 'transfer', 'other');
create type public.finance_scope as enum ('order', 'rental');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  scope public.finance_scope not null default 'order',
  order_id uuid references public.orders(id) on delete cascade,
  rental_record_id uuid references public.rental_records(id) on delete cascade,
  receipt_no text not null unique,
  amount numeric(12,2) not null,
  method public.payment_method not null default 'cash',
  paid_at date not null default current_date,
  reference text,
  notes text,
  is_deposit boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index payments_order_idx on public.payments(order_id);
create index payments_rental_idx on public.payments(rental_record_id);
create index payments_paid_at_idx on public.payments(paid_at);

grant select, insert, update on public.payments to authenticated;
grant all on public.payments to service_role;
alter table public.payments enable row level security;

create policy "finance read payments" on public.payments
  for select to authenticated
  using (private.can(auth.uid(), 'finance.payments') or private.can(auth.uid(), 'finance.invoices'));
create policy "finance insert payments" on public.payments
  for insert to authenticated
  with check (private.can(auth.uid(), 'finance.payments'));
create policy "finance update payments" on public.payments
  for update to authenticated
  using (private.can(auth.uid(), 'finance.payments'));

-- رقم السند التلقائي
create or replace function public.set_receipt_no()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.receipt_no is null or btrim(new.receipt_no) = '' then
    new.receipt_no := 'R-' || lpad(nextval('public.finance_receipt_seq')::text, 5, '0');
  end if;
  if new.amount <= 0 then
    raise exception 'المبلغ يجب أن يكون أكبر من صفر';
  end if;
  if new.scope = 'order' and new.order_id is null then
    raise exception 'الدفعة يجب أن تكون مرتبطة بطلب';
  end if;
  if new.scope = 'rental' and new.rental_record_id is null then
    raise exception 'الدفعة يجب أن تكون مرتبطة بعقد إيجار';
  end if;
  return new;
end $$;

create trigger payments_receipt_no before insert on public.payments
  for each row execute function public.set_receipt_no();

-- تحديث حالة الدفع للطلب من مجموع الدفعات
create or replace function public.sync_order_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order uuid := coalesce(new.order_id, old.order_id);
  v_paid numeric;
  v_total numeric;
begin
  if v_order is null then
    return coalesce(new, old);
  end if;

  select coalesce(sum(amount), 0) into v_paid from public.payments where order_id = v_order;
  select total_amount into v_total from public.orders where id = v_order;

  update public.orders
     set deposit_amount = v_paid,
         payment_status = case
           when v_paid <= 0 then 'unpaid'::public.payment_status
           when v_paid >= coalesce(v_total, 0) and coalesce(v_total, 0) > 0 then 'paid'::public.payment_status
           else 'partial'::public.payment_status end
   where id = v_order;

  if tg_op = 'INSERT' then
    perform private.log_activity(v_order, null, 'payment_received',
      'سند قبض ' || new.receipt_no || ' — ' || new.amount::text);
  end if;
  return coalesce(new, old);
end $$;

create trigger payments_sync_order after insert or update on public.payments
  for each row execute function public.sync_order_payment();

-- ============ الفواتير ============
create type public.invoice_status as enum ('draft', 'issued', 'cancelled');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  scope public.finance_scope not null default 'order',
  order_id uuid references public.orders(id) on delete cascade,
  rental_record_id uuid references public.rental_records(id) on delete cascade,
  invoice_no text not null unique,
  issue_date date not null default current_date,
  status public.invoice_status not null default 'draft',
  is_taxable boolean not null default true,
  vat_rate numeric(6,3) not null default 15,
  subtotal numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoices_order_idx on public.invoices(order_id);
create index invoices_rental_idx on public.invoices(rental_record_id);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  qty numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  position integer not null default 1,
  created_at timestamptz not null default now()
);

create index invoice_lines_invoice_idx on public.invoice_lines(invoice_id);

grant select, insert, update on public.invoices to authenticated;
grant all on public.invoices to service_role;
grant select, insert, update, delete on public.invoice_lines to authenticated;
grant all on public.invoice_lines to service_role;

alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;

create policy "finance read invoices" on public.invoices
  for select to authenticated using (private.can(auth.uid(), 'finance.invoices'));
create policy "finance write invoices" on public.invoices
  for insert to authenticated with check (private.can(auth.uid(), 'finance.invoices'));
create policy "finance update invoices" on public.invoices
  for update to authenticated using (private.can(auth.uid(), 'finance.invoices'));

create policy "finance read invoice lines" on public.invoice_lines
  for select to authenticated using (private.can(auth.uid(), 'finance.invoices'));
create policy "finance write invoice lines" on public.invoice_lines
  for insert to authenticated with check (private.can(auth.uid(), 'finance.invoices'));
create policy "finance update invoice lines" on public.invoice_lines
  for update to authenticated using (private.can(auth.uid(), 'finance.invoices'));
create policy "finance delete invoice lines" on public.invoice_lines
  for delete to authenticated using (private.can(auth.uid(), 'finance.invoices'));

create trigger invoices_touch before update on public.invoices
  for each row execute function public.touch_updated_at();

create or replace function public.set_invoice_no()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.invoice_no is null or btrim(new.invoice_no) = '' then
    new.invoice_no := 'INV-' || to_char(now(), 'YYYY') || '-'
      || lpad(nextval('public.finance_invoice_seq')::text, 5, '0');
  end if;
  if new.vat_rate is null then
    new.vat_rate := coalesce((select vat_rate from public.tax_settings limit 1), 15);
  end if;
  return new;
end $$;

create trigger invoices_number before insert on public.invoices
  for each row execute function public.set_invoice_no();

create or replace function public.recalc_invoice_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice uuid := coalesce(new.invoice_id, old.invoice_id);
  v_sub numeric;
  v_rate numeric;
  v_taxable boolean;
begin
  select coalesce(sum(qty * unit_price), 0) into v_sub
    from public.invoice_lines where invoice_id = v_invoice;
  select vat_rate, is_taxable into v_rate, v_taxable
    from public.invoices where id = v_invoice;

  update public.invoices
     set subtotal = round(v_sub, 2),
         tax_amount = case when v_taxable then round(v_sub * coalesce(v_rate, 0) / 100, 2) else 0 end,
         total = round(v_sub, 2)
           + case when v_taxable then round(v_sub * coalesce(v_rate, 0) / 100, 2) else 0 end
   where id = v_invoice;
  return coalesce(new, old);
end $$;

create trigger invoice_lines_recalc after insert or update or delete on public.invoice_lines
  for each row execute function public.recalc_invoice_totals();

-- ترحيل العربون الحالي كأول دفعة لكل طلب
insert into public.payments (scope, order_id, receipt_no, amount, method, paid_at, notes, is_deposit, created_by, created_at)
select 'order', o.id,
       'R-' || lpad(nextval('public.finance_receipt_seq')::text, 5, '0'),
       o.deposit_amount, 'cash', o.booked_at, 'عربون مُرحَّل من التسجيل السابق', true, o.created_by, o.created_at
  from public.orders o
 where o.deposit_amount > 0;
