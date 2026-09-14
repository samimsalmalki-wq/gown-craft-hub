-- ============ إعادة حساب إجمالي الفاتورة عند تغيير الضريبة ============
create or replace function public.recalc_invoice_on_tax()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_sub numeric;
begin
  select coalesce(sum(qty * unit_price), 0) into v_sub
    from public.invoice_lines where invoice_id = new.id;
  new.subtotal := round(v_sub, 2);
  new.tax_amount := case when new.is_taxable
    then round(v_sub * coalesce(new.vat_rate, 0) / 100, 2) else 0 end;
  new.total := new.subtotal + new.tax_amount;
  return new;
end $$;

create trigger invoices_recalc_tax before update of is_taxable, vat_rate on public.invoices
  for each row execute function public.recalc_invoice_on_tax();

-- ============ الموردون ============
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  tax_number text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.suppliers to authenticated;
grant all on public.suppliers to service_role;
alter table public.suppliers enable row level security;

create policy "team read suppliers" on public.suppliers
  for select to authenticated using (private.is_staff(auth.uid()));
create policy "finance insert suppliers" on public.suppliers
  for insert to authenticated with check (private.can(auth.uid(), 'finance.expenses'));
create policy "finance update suppliers" on public.suppliers
  for update to authenticated using (private.can(auth.uid(), 'finance.expenses'));

create trigger suppliers_touch before update on public.suppliers
  for each row execute function public.touch_updated_at();

-- ============ تصنيفات المصروفات ============
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

grant select, insert, update on public.expense_categories to authenticated;
grant all on public.expense_categories to service_role;
alter table public.expense_categories enable row level security;

create policy "team read expense categories" on public.expense_categories
  for select to authenticated using (private.is_staff(auth.uid()));
create policy "finance insert expense categories" on public.expense_categories
  for insert to authenticated with check (private.can(auth.uid(), 'finance.expenses'));
create policy "finance update expense categories" on public.expense_categories
  for update to authenticated using (private.can(auth.uid(), 'finance.expenses'));

insert into public.expense_categories (name, position) values
  ('خامات وأقمشة', 1),
  ('أجور وعمالة', 2),
  ('إيجار المحل', 3),
  ('كهرباء وخدمات', 4),
  ('صيانة وتنظيف', 5),
  ('تسويق وإعلان', 6),
  ('مصاريف إدارية', 7),
  ('أخرى', 8);

-- ============ الصناديق والحسابات النقدية ============
create type public.cash_account_kind as enum ('cash', 'card', 'bank');
create type public.cash_direction as enum ('in', 'out');

create table public.cash_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind public.cash_account_kind not null default 'cash',
  opening_balance numeric(12,2) not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.cash_accounts to authenticated;
grant all on public.cash_accounts to service_role;
alter table public.cash_accounts enable row level security;

create policy "finance read cash accounts" on public.cash_accounts
  for select to authenticated
  using (private.can(auth.uid(), 'finance.expenses') or private.can(auth.uid(), 'finance.payments'));
create policy "finance insert cash accounts" on public.cash_accounts
  for insert to authenticated with check (private.can(auth.uid(), 'finance.expenses'));
create policy "finance update cash accounts" on public.cash_accounts
  for update to authenticated using (private.can(auth.uid(), 'finance.expenses'));

create trigger cash_accounts_touch before update on public.cash_accounts
  for each row execute function public.touch_updated_at();

insert into public.cash_accounts (name, kind) values
  ('الصندوق النقدي', 'cash'),
  ('نقاط البيع (الشبكة)', 'card'),
  ('الحساب البنكي', 'bank');

create table public.cash_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.cash_accounts(id) on delete restrict,
  direction public.cash_direction not null,
  amount numeric(12,2) not null,
  occurred_at date not null default current_date,
  source text not null default 'manual',
  source_id uuid,
  description text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index cash_tx_account_idx on public.cash_transactions(account_id);
create index cash_tx_date_idx on public.cash_transactions(occurred_at);

grant select, insert on public.cash_transactions to authenticated;
grant all on public.cash_transactions to service_role;
alter table public.cash_transactions enable row level security;

create policy "finance read cash tx" on public.cash_transactions
  for select to authenticated
  using (private.can(auth.uid(), 'finance.expenses') or private.can(auth.uid(), 'finance.reports'));
create policy "finance insert cash tx" on public.cash_transactions
  for insert to authenticated with check (private.can(auth.uid(), 'finance.expenses'));

-- ============ المصروفات والمشتريات ============
create sequence public.finance_expense_seq start 1;

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_no text not null unique,
  category_id uuid references public.expense_categories(id),
  supplier_id uuid references public.suppliers(id),
  cash_account_id uuid references public.cash_accounts(id),
  amount numeric(12,2) not null,
  is_taxable boolean not null default false,
  vat_amount numeric(12,2) not null default 0,
  occurred_at date not null default current_date,
  description text not null,
  reference text,
  material_id uuid references public.materials(id),
  material_qty numeric(12,2),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expenses_date_idx on public.expenses(occurred_at);
create index expenses_category_idx on public.expenses(category_id);

grant select, insert, update on public.expenses to authenticated;
grant all on public.expenses to service_role;
alter table public.expenses enable row level security;

create policy "finance read expenses" on public.expenses
  for select to authenticated
  using (private.can(auth.uid(), 'finance.expenses') or private.can(auth.uid(), 'finance.reports'));
create policy "finance insert expenses" on public.expenses
  for insert to authenticated with check (private.can(auth.uid(), 'finance.expenses'));
create policy "finance update expenses" on public.expenses
  for update to authenticated using (private.can(auth.uid(), 'finance.expenses'));

create trigger expenses_touch before update on public.expenses
  for each row execute function public.touch_updated_at();

create or replace function public.set_expense_no()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_rate numeric;
begin
  if new.expense_no is null or btrim(new.expense_no) = '' then
    new.expense_no := 'EXP-' || lpad(nextval('public.finance_expense_seq')::text, 5, '0');
  end if;
  if new.amount <= 0 then
    raise exception 'مبلغ المصروف يجب أن يكون أكبر من صفر';
  end if;
  if new.is_taxable and coalesce(new.vat_amount, 0) = 0 then
    select vat_rate into v_rate from public.tax_settings limit 1;
    new.vat_amount := round(new.amount * coalesce(v_rate, 0) / (100 + coalesce(v_rate, 0)), 2);
  end if;
  return new;
end $$;

create trigger expenses_number before insert on public.expenses
  for each row execute function public.set_expense_no();

-- تسجيل حركة الصندوق وإدخال الخامة عند صرف مصروف
create or replace function public.post_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cash_account_id is not null then
    insert into public.cash_transactions
      (account_id, direction, amount, occurred_at, source, source_id, description, created_by)
    values (new.cash_account_id, 'out', new.amount, new.occurred_at, 'expense', new.id,
            new.expense_no || ' — ' || new.description, new.created_by);
  end if;

  if new.material_id is not null and coalesce(new.material_qty, 0) > 0 then
    insert into public.material_movements (material_id, kind, qty, notes, created_by)
    values (new.material_id, 'in', new.material_qty,
            'شراء بمستند ' || new.expense_no, new.created_by);
  end if;
  return new;
end $$;

create trigger expenses_post after insert on public.expenses
  for each row execute function public.post_expense();

-- ربط الدفعات بالصندوق وتسجيل حركة قبض
alter table public.payments add column cash_account_id uuid references public.cash_accounts(id);

create or replace function public.post_payment_cash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cash_account_id is not null then
    insert into public.cash_transactions
      (account_id, direction, amount, occurred_at, source, source_id, description, created_by)
    values (new.cash_account_id, 'in', new.amount, new.paid_at, 'payment', new.id,
            'سند قبض ' || new.receipt_no, new.created_by);
  end if;
  return new;
end $$;

create trigger payments_post_cash after insert on public.payments
  for each row execute function public.post_payment_cash();
