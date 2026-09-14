-- ============ دليل الحسابات ============
create type public.gl_account_type as enum ('asset', 'liability', 'equity', 'revenue', 'cost', 'expense');

create table public.gl_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  type public.gl_account_type not null,
  parent_id uuid references public.gl_accounts(id),
  is_group boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.gl_accounts to authenticated;
grant all on public.gl_accounts to service_role;
alter table public.gl_accounts enable row level security;

create policy "finance read gl accounts" on public.gl_accounts
  for select to authenticated
  using (private.can(auth.uid(), 'finance.accounts') or private.can(auth.uid(), 'finance.reports'));
create policy "finance insert gl accounts" on public.gl_accounts
  for insert to authenticated with check (private.can(auth.uid(), 'finance.accounts'));
create policy "finance update gl accounts" on public.gl_accounts
  for update to authenticated using (private.can(auth.uid(), 'finance.accounts'));

create trigger gl_accounts_touch before update on public.gl_accounts
  for each row execute function public.touch_updated_at();

-- ============ قيود اليومية ============
create sequence public.finance_journal_seq start 1;

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_no text not null unique,
  entry_date date not null default current_date,
  memo text not null,
  source text not null default 'manual',
  source_id uuid,
  is_reversal boolean not null default false,
  reverses_id uuid references public.journal_entries(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  account_id uuid not null references public.gl_accounts(id),
  debit numeric(12,2) not null default 0,
  credit numeric(12,2) not null default 0,
  memo text,
  created_at timestamptz not null default now()
);

create index journal_lines_entry_idx on public.journal_lines(entry_id);
create index journal_lines_account_idx on public.journal_lines(account_id);
create index journal_entries_date_idx on public.journal_entries(entry_date);

grant select, insert on public.journal_entries to authenticated;
grant all on public.journal_entries to service_role;
grant select, insert on public.journal_lines to authenticated;
grant all on public.journal_lines to service_role;

alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;

create policy "finance read entries" on public.journal_entries
  for select to authenticated
  using (private.can(auth.uid(), 'finance.accounts') or private.can(auth.uid(), 'finance.reports'));
create policy "finance insert entries" on public.journal_entries
  for insert to authenticated with check (private.can(auth.uid(), 'finance.accounts'));
create policy "finance read lines" on public.journal_lines
  for select to authenticated
  using (private.can(auth.uid(), 'finance.accounts') or private.can(auth.uid(), 'finance.reports'));
create policy "finance insert lines" on public.journal_lines
  for insert to authenticated with check (private.can(auth.uid(), 'finance.accounts'));

-- شجرة الحسابات الافتراضية
insert into public.gl_accounts (code, name, type, is_group) values
  ('1000', 'الأصول', 'asset', true),
  ('2000', 'الالتزامات', 'liability', true),
  ('3000', 'حقوق الملكية', 'equity', true),
  ('4000', 'الإيرادات', 'revenue', true),
  ('5000', 'تكلفة الإيراد', 'cost', true),
  ('6000', 'مصاريف التشغيل', 'expense', true);

insert into public.gl_accounts (code, name, type, parent_id) values
  ('1110', 'الصندوق النقدي', 'asset', (select id from public.gl_accounts where code = '1000')),
  ('1120', 'نقاط البيع (الشبكة)', 'asset', (select id from public.gl_accounts where code = '1000')),
  ('1130', 'الحساب البنكي', 'asset', (select id from public.gl_accounts where code = '1000')),
  ('1210', 'مدينون — عميلات التفصيل', 'asset', (select id from public.gl_accounts where code = '1000')),
  ('1220', 'مدينون — عقود الإيجار', 'asset', (select id from public.gl_accounts where code = '1000')),
  ('1310', 'مخزون الخامات', 'asset', (select id from public.gl_accounts where code = '1000')),
  ('1410', 'فساتين الإيجار', 'asset', (select id from public.gl_accounts where code = '1000')),
  ('1420', 'مجمع إهلاك فساتين الإيجار', 'asset', (select id from public.gl_accounts where code = '1000')),
  ('2110', 'دفعات مقدمة من العميلات', 'liability', (select id from public.gl_accounts where code = '2000')),
  ('2120', 'تأمينات الإيجار المستردة', 'liability', (select id from public.gl_accounts where code = '2000')),
  ('2210', 'ضريبة القيمة المضافة — مخرجات', 'liability', (select id from public.gl_accounts where code = '2000')),
  ('2220', 'ضريبة القيمة المضافة — مدخلات', 'liability', (select id from public.gl_accounts where code = '2000')),
  ('2310', 'دائنون وموردون', 'liability', (select id from public.gl_accounts where code = '2000')),
  ('3100', 'رأس المال', 'equity', (select id from public.gl_accounts where code = '3000')),
  ('3200', 'الأرباح المُحتجزة', 'equity', (select id from public.gl_accounts where code = '3000')),
  ('4110', 'إيرادات تفصيل الفساتين', 'revenue', (select id from public.gl_accounts where code = '4000')),
  ('4120', 'إيرادات التعديلات', 'revenue', (select id from public.gl_accounts where code = '4000')),
  ('4210', 'إيرادات تأجير الفساتين', 'revenue', (select id from public.gl_accounts where code = '4000')),
  ('5110', 'تكلفة الخامات المستهلكة', 'cost', (select id from public.gl_accounts where code = '5000')),
  ('5120', 'أجور الخياطة والتطريز', 'cost', (select id from public.gl_accounts where code = '5000')),
  ('5210', 'إهلاك فساتين الإيجار', 'cost', (select id from public.gl_accounts where code = '5000')),
  ('5220', 'تنظيف وصيانة الفساتين', 'cost', (select id from public.gl_accounts where code = '5000')),
  ('6110', 'رواتب وأجور إدارية', 'expense', (select id from public.gl_accounts where code = '6000')),
  ('6210', 'إيجار المحل', 'expense', (select id from public.gl_accounts where code = '6000')),
  ('6220', 'كهرباء وخدمات', 'expense', (select id from public.gl_accounts where code = '6000')),
  ('6310', 'تسويق وإعلان', 'expense', (select id from public.gl_accounts where code = '6000')),
  ('6410', 'مصاريف إدارية متنوعة', 'expense', (select id from public.gl_accounts where code = '6000'));

-- ربط الصناديق وتصنيفات المصروفات بالحسابات
alter table public.cash_accounts add column gl_code text not null default '1110';
alter table public.expense_categories add column gl_code text not null default '6410';

update public.cash_accounts set gl_code = case kind
  when 'cash' then '1110' when 'card' then '1120' else '1130' end;

update public.expense_categories set gl_code = case name
  when 'خامات وأقمشة' then '1310'
  when 'أجور وعمالة' then '5120'
  when 'إيجار المحل' then '6210'
  when 'كهرباء وخدمات' then '6220'
  when 'صيانة وتنظيف' then '5220'
  when 'تسويق وإعلان' then '6310'
  else '6410' end;

-- ============ محرّك القيود التلقائية ============
create or replace function private.acct(_code text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$ select id from public.gl_accounts where code = _code limit 1 $$;

create or replace function private.post_entry(
  _date date, _memo text, _source text, _source_id uuid,
  _lines jsonb, _actor uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry uuid;
  v_no text;
  v_line jsonb;
  v_debit numeric := 0;
  v_credit numeric := 0;
begin
  for v_line in select * from jsonb_array_elements(_lines) loop
    v_debit := v_debit + coalesce((v_line->>'debit')::numeric, 0);
    v_credit := v_credit + coalesce((v_line->>'credit')::numeric, 0);
  end loop;

  if round(v_debit, 2) <> round(v_credit, 2) then
    raise exception 'القيد غير متوازن: مدين % ودائن %', v_debit, v_credit;
  end if;
  if round(v_debit, 2) = 0 then
    return null;
  end if;

  v_no := 'JV-' || lpad(nextval('public.finance_journal_seq')::text, 6, '0');

  insert into public.journal_entries (entry_no, entry_date, memo, source, source_id, created_by)
  values (v_no, _date, _memo, _source, _source_id, _actor)
  returning id into v_entry;

  for v_line in select * from jsonb_array_elements(_lines) loop
    insert into public.journal_lines (entry_id, account_id, debit, credit, memo)
    select v_entry, private.acct(v_line->>'code'),
           coalesce((v_line->>'debit')::numeric, 0),
           coalesce((v_line->>'credit')::numeric, 0),
           v_line->>'memo'
     where private.acct(v_line->>'code') is not null;
  end loop;

  return v_entry;
end $$;

grant execute on function private.post_entry(date, text, text, uuid, jsonb, uuid) to authenticated;

-- قيد سند القبض: مدين الصندوق / دائن دفعات مقدمة (أو إيراد إيجار)
create or replace function public.post_payment_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cash text := '1110';
  v_credit text;
begin
  if new.cash_account_id is not null then
    select gl_code into v_cash from public.cash_accounts where id = new.cash_account_id;
  end if;
  v_credit := case when new.scope = 'rental' then '4210' else '2110' end;

  perform private.post_entry(
    new.paid_at,
    'سند قبض ' || new.receipt_no,
    'payment', new.id,
    jsonb_build_array(
      jsonb_build_object('code', coalesce(v_cash, '1110'), 'debit', new.amount, 'credit', 0),
      jsonb_build_object('code', v_credit, 'debit', 0, 'credit', new.amount)
    ),
    new.created_by
  );
  return new;
end $$;

create trigger payments_post_entry after insert on public.payments
  for each row execute function public.post_payment_entry();

-- قيد المصروف: مدين حساب المصروف + ضريبة المدخلات / دائن الصندوق
create or replace function public.post_expense_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debit text := '6410';
  v_cash text := '1110';
  v_net numeric;
  v_lines jsonb;
begin
  if new.category_id is not null then
    select gl_code into v_debit from public.expense_categories where id = new.category_id;
  end if;
  if new.cash_account_id is not null then
    select gl_code into v_cash from public.cash_accounts where id = new.cash_account_id;
  end if;

  v_net := new.amount - coalesce(new.vat_amount, 0);
  v_lines := jsonb_build_array(
    jsonb_build_object('code', coalesce(v_debit, '6410'), 'debit', v_net, 'credit', 0),
    jsonb_build_object('code', coalesce(v_cash, '1110'), 'debit', 0, 'credit', new.amount)
  );
  if coalesce(new.vat_amount, 0) > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('code', '2220', 'debit', new.vat_amount, 'credit', 0));
  end if;

  perform private.post_entry(new.occurred_at,
    'مصروف ' || new.expense_no || ' — ' || new.description,
    'expense', new.id, v_lines, new.created_by);
  return new;
end $$;

create trigger expenses_post_entry after insert on public.expenses
  for each row execute function public.post_expense_entry();

-- قيد الفاتورة عند الإصدار: مدين المدينون / دائن الإيراد وضريبة المخرجات
create or replace function public.post_invoice_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receivable text;
  v_revenue text;
  v_lines jsonb;
begin
  if new.status <> 'issued' or old.status = 'issued' then
    return new;
  end if;

  v_receivable := case when new.scope = 'rental' then '1220' else '1210' end;
  v_revenue := case when new.scope = 'rental' then '4210' else '4110' end;

  v_lines := jsonb_build_array(
    jsonb_build_object('code', v_receivable, 'debit', new.total, 'credit', 0),
    jsonb_build_object('code', v_revenue, 'debit', 0, 'credit', new.subtotal)
  );
  if new.tax_amount > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('code', '2210', 'debit', 0, 'credit', new.tax_amount));
  end if;

  perform private.post_entry(new.issue_date, 'فاتورة ' || new.invoice_no,
    'invoice', new.id, v_lines, new.created_by);
  return new;
end $$;

create trigger invoices_post_entry after update of status on public.invoices
  for each row execute function public.post_invoice_entry();

-- قيد صرف الخامات للإنتاج: مدين تكلفة الخامات / دائن المخزون
create or replace function public.post_material_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_cost numeric; v_name text;
begin
  if new.kind <> 'out' then
    return new;
  end if;
  select unit_cost, name into v_cost, v_name from public.materials where id = new.material_id;
  if coalesce(v_cost, 0) <= 0 then
    return new;
  end if;

  perform private.post_entry(new.created_at::date,
    'صرف خامة: ' || coalesce(v_name, '') || ' × ' || new.qty::text,
    'material_out', new.id,
    jsonb_build_array(
      jsonb_build_object('code', '5110', 'debit', round(new.qty * v_cost, 2), 'credit', 0),
      jsonb_build_object('code', '1310', 'debit', 0, 'credit', round(new.qty * v_cost, 2))
    ),
    new.created_by);
  return new;
end $$;

create trigger movements_post_entry after insert on public.material_movements
  for each row execute function public.post_material_entry();

-- تحويل الدفعات المقدمة إلى إيراد عند تسليم الطلب
create or replace function public.recognize_order_revenue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_paid numeric;
begin
  if new.state <> 'delivered' or old.state = 'delivered' then
    return new;
  end if;
  select coalesce(sum(amount), 0) into v_paid from public.payments where order_id = new.id;
  if v_paid <= 0 then
    return new;
  end if;

  perform private.post_entry(current_date,
    'إثبات إيراد تسليم الطلب ' || new.order_no,
    'order_delivered', new.id,
    jsonb_build_array(
      jsonb_build_object('code', '2110', 'debit', v_paid, 'credit', 0),
      jsonb_build_object('code', '4110', 'debit', 0, 'credit', v_paid)
    ),
    new.created_by);
  return new;
end $$;

create trigger orders_recognize_revenue after update of state on public.orders
  for each row execute function public.recognize_order_revenue();
