-- ===== 1) جدول الفروع =====
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  address text,
  phone text,
  tax_number text,
  is_main boolean not null default false,
  is_active boolean not null default true,
  position integer not null default 1,
  order_counter integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.branches to authenticated;
grant all on public.branches to service_role;
alter table public.branches enable row level security;

insert into public.branches (name, code, is_main, position)
select 'سوق مكة', 'MK', true, 1
where not exists (select 1 from public.branches where code = 'MK');
insert into public.branches (name, code, is_main, position)
select 'سوق مارينا', 'MR', false, 2
where not exists (select 1 from public.branches where code = 'MR');

create trigger branches_touch before update on public.branches
for each row execute function public.touch_updated_at();

-- ===== 2) عمود الفرع على الجداول =====
alter table public.profiles add column if not exists branch_id uuid references public.branches(id);
alter table public.orders add column if not exists branch_id uuid references public.branches(id);
alter table public.rental_dresses add column if not exists branch_id uuid references public.branches(id);
alter table public.rental_records add column if not exists branch_id uuid references public.branches(id);
alter table public.cash_accounts add column if not exists branch_id uuid references public.branches(id);
alter table public.payments add column if not exists branch_id uuid references public.branches(id);
alter table public.invoices add column if not exists branch_id uuid references public.branches(id);
alter table public.expenses add column if not exists branch_id uuid references public.branches(id);
alter table public.journal_entries add column if not exists branch_id uuid references public.branches(id);
alter table public.material_movements add column if not exists branch_id uuid references public.branches(id);
alter table public.tax_settings add column if not exists branch_id uuid references public.branches(id);

update public.orders set branch_id = (select id from public.branches where code='MK') where branch_id is null;
update public.rental_dresses set branch_id = (select id from public.branches where code='MK') where branch_id is null;
update public.rental_records set branch_id = (select id from public.branches where code='MK') where branch_id is null;
update public.cash_accounts set branch_id = (select id from public.branches where code='MK') where branch_id is null;
update public.payments set branch_id = (select id from public.branches where code='MK') where branch_id is null;
update public.invoices set branch_id = (select id from public.branches where code='MK') where branch_id is null;
update public.expenses set branch_id = (select id from public.branches where code='MK') where branch_id is null;
update public.journal_entries set branch_id = (select id from public.branches where code='MK') where branch_id is null;
update public.material_movements set branch_id = (select id from public.branches where code='MK') where branch_id is null;
update public.tax_settings set branch_id = (select id from public.branches where code='MK') where branch_id is null;

create index if not exists orders_branch_idx on public.orders(branch_id);
create index if not exists payments_branch_idx on public.payments(branch_id);
create index if not exists expenses_branch_idx on public.expenses(branch_id);
create index if not exists entries_branch_idx on public.journal_entries(branch_id);

-- ===== 3) دوال الفرع وسياساته =====
create or replace function private.user_branch(_uid uuid)
returns uuid language sql stable security definer set search_path to 'public' as $$
  select branch_id from public.profiles where id = _uid
$$;

create or replace function private.can_all_branches(_uid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select private.has_role(_uid, 'admin')
      or private.can(_uid, 'branches.all')
      or (select branch_id from public.profiles where id = _uid) is null
$$;

create or replace function private.branch_ok(_uid uuid, _branch uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select _branch is null
      or private.can_all_branches(_uid)
      or _branch = (select branch_id from public.profiles where id = _uid)
$$;

create policy "branches readable by team" on public.branches
for select to authenticated using (private.is_team(auth.uid()));
create policy "branches insert by admin" on public.branches
for insert to authenticated with check (private.has_role(auth.uid(), 'admin'));
create policy "branches update by admin" on public.branches
for update to authenticated using (private.has_role(auth.uid(), 'admin'));

-- ===== 4) مخزون كل فرع =====
create table if not exists public.material_stock (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  qty_on_hand numeric not null default 0,
  qty_reserved numeric not null default 0,
  min_qty numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (material_id, branch_id)
);

grant select, insert, update on public.material_stock to authenticated;
grant all on public.material_stock to service_role;
alter table public.material_stock enable row level security;

create policy "stock readable by team" on public.material_stock
for select to authenticated using (private.is_team(auth.uid()));
create policy "stock insert by managers" on public.material_stock
for insert to authenticated with check (private.can(auth.uid(), 'inventory.manage'));
create policy "stock update by managers" on public.material_stock
for update to authenticated using (private.can(auth.uid(), 'inventory.manage'))
with check (private.can(auth.uid(), 'inventory.manage'));

create trigger material_stock_touch before update on public.material_stock
for each row execute function public.touch_updated_at();

insert into public.material_stock (material_id, branch_id, qty_on_hand, qty_reserved, min_qty)
select m.id, (select id from public.branches where code='MK'), m.qty_on_hand, m.qty_reserved, m.min_qty
from public.materials m
on conflict (material_id, branch_id) do nothing;

-- ===== 5) حركة المخزون على مستوى الفرع =====
create or replace function public.apply_material_movement()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_name text;
  v_branch uuid;
begin
  select name into v_name from public.materials where id = new.material_id;
  v_branch := coalesce(new.branch_id, (select id from public.branches where is_main limit 1));

  insert into public.material_stock (material_id, branch_id)
  values (new.material_id, v_branch)
  on conflict (material_id, branch_id) do nothing;

  if new.kind = 'in' then
    update public.material_stock set qty_on_hand = qty_on_hand + new.qty
      where material_id = new.material_id and branch_id = v_branch;
    update public.materials set qty_on_hand = qty_on_hand + new.qty where id = new.material_id;
  elsif new.kind = 'out' then
    update public.material_stock
       set qty_on_hand = qty_on_hand - new.qty,
           qty_reserved = greatest(0, qty_reserved - new.qty)
     where material_id = new.material_id and branch_id = v_branch;
    update public.materials
       set qty_on_hand = qty_on_hand - new.qty,
           qty_reserved = greatest(0, qty_reserved - new.qty)
     where id = new.material_id;
  elsif new.kind = 'reserve' then
    update public.material_stock set qty_reserved = qty_reserved + new.qty
      where material_id = new.material_id and branch_id = v_branch;
    update public.materials set qty_reserved = qty_reserved + new.qty where id = new.material_id;
  elsif new.kind = 'release' then
    update public.material_stock set qty_reserved = greatest(0, qty_reserved - new.qty)
      where material_id = new.material_id and branch_id = v_branch;
    update public.materials set qty_reserved = greatest(0, qty_reserved - new.qty) where id = new.material_id;
  end if;

  if new.order_id is not null then
    perform private.log_activity(new.order_id, null, 'material_' || new.kind::text,
      coalesce(v_name,'مادة') || ' — ' || new.qty::text);
  end if;
  return new;
end $$;

create or replace function public.transfer_material(
  p_material_id uuid, p_from_branch uuid, p_to_branch uuid, p_qty numeric, p_notes text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_avail numeric;
begin
  if not private.can(auth.uid(), 'inventory.transfer') and not private.can(auth.uid(), 'inventory.manage') then
    raise exception 'غير مصرح';
  end if;
  if p_from_branch = p_to_branch then
    raise exception 'الفرع المُرسل والمُستقبِل متطابقان';
  end if;
  if coalesce(p_qty, 0) <= 0 then
    raise exception 'الكمية يجب أن تكون أكبر من صفر';
  end if;

  select qty_on_hand - qty_reserved into v_avail
    from public.material_stock
   where material_id = p_material_id and branch_id = p_from_branch;

  if coalesce(v_avail, 0) < p_qty then
    raise exception 'الكمية المتاحة في الفرع المُرسل غير كافية';
  end if;

  insert into public.material_movements (material_id, branch_id, kind, qty, notes, created_by)
  values (p_material_id, p_from_branch, 'out', p_qty,
          coalesce(p_notes, '') || ' — نقل إلى فرع آخر', auth.uid());

  insert into public.material_movements (material_id, branch_id, kind, qty, notes, created_by)
  values (p_material_id, p_to_branch, 'in', p_qty,
          coalesce(p_notes, '') || ' — نقل من فرع آخر', auth.uid());
end $$;

grant execute on function public.transfer_material(uuid, uuid, uuid, numeric, text) to authenticated;

-- ===== 6) ترقيم الطلبات لكل فرع =====
create or replace function public.set_order_no_branch()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_code text; v_n integer;
begin
  if new.branch_id is null then
    new.branch_id := (select id from public.branches where is_main limit 1);
  end if;
  if new.branch_id is not null then
    update public.branches set order_counter = order_counter + 1
     where id = new.branch_id
     returning code, order_counter into v_code, v_n;
    if v_code is not null then
      new.order_no := v_code || '-' || lpad(v_n::text, 4, '0');
    end if;
  end if;
  return new;
end $$;

create trigger orders_branch_no before insert on public.orders
for each row execute function public.set_order_no_branch();

-- ===== 7) قيود الفرع في سياسات الوصول =====
drop policy if exists "orders readable by team" on public.orders;
create policy "orders readable by team" on public.orders
for select to authenticated
using (private.is_team(auth.uid()) and private.branch_ok(auth.uid(), branch_id));

drop policy if exists "stages readable by team" on public.order_stages;
create policy "stages readable by team" on public.order_stages
for select to authenticated
using (private.is_team(auth.uid()) and exists (
  select 1 from public.orders o where o.id = order_id and private.branch_ok(auth.uid(), o.branch_id)));

drop policy if exists "dresses readable by team" on public.rental_dresses;
create policy "dresses readable by team" on public.rental_dresses
for select to authenticated
using (private.is_team(auth.uid()) and private.branch_ok(auth.uid(), branch_id));

drop policy if exists "finance read payments" on public.payments;
create policy "finance read payments" on public.payments
for select to authenticated
using ((private.can(auth.uid(), 'finance.payments') or private.can(auth.uid(), 'finance.invoices')
        or private.can(auth.uid(), 'finance.reports'))
       and private.branch_ok(auth.uid(), branch_id));

drop policy if exists "finance read expenses" on public.expenses;
create policy "finance read expenses" on public.expenses
for select to authenticated
using ((private.can(auth.uid(), 'finance.expenses') or private.can(auth.uid(), 'finance.reports'))
       and private.branch_ok(auth.uid(), branch_id));

drop policy if exists "finance read invoices" on public.invoices;
create policy "finance read invoices" on public.invoices
for select to authenticated
using (private.can(auth.uid(), 'finance.invoices') and private.branch_ok(auth.uid(), branch_id));

drop policy if exists "finance read cash accounts" on public.cash_accounts;
create policy "finance read cash accounts" on public.cash_accounts
for select to authenticated
using ((private.can(auth.uid(), 'finance.expenses') or private.can(auth.uid(), 'finance.payments')
        or private.can(auth.uid(), 'finance.reports'))
       and private.branch_ok(auth.uid(), branch_id));

drop policy if exists "finance read entries" on public.journal_entries;
create policy "finance read entries" on public.journal_entries
for select to authenticated
using ((private.can(auth.uid(), 'finance.accounts') or private.can(auth.uid(), 'finance.reports'))
       and private.branch_ok(auth.uid(), branch_id));

-- ===== 8) القيود التلقائية تحمل الفرع =====
create or replace function private.post_entry_branch(_entry_id uuid, _branch uuid)
returns void language sql security definer set search_path to 'public' as $$
  update public.journal_entries set branch_id = coalesce(_branch, branch_id) where id = _entry_id;
$$;

create or replace function public.post_payment_entry()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_cash text := '1110';
  v_credit text;
  v_entry uuid;
begin
  if new.cash_account_id is not null then
    select gl_code into v_cash from public.cash_accounts where id = new.cash_account_id;
  end if;
  v_credit := case when new.scope = 'rental' then '4210' else '2110' end;

  v_entry := private.post_entry(
    new.paid_at,
    'سند قبض ' || new.receipt_no,
    'payment', new.id,
    jsonb_build_array(
      jsonb_build_object('code', coalesce(v_cash, '1110'), 'debit', new.amount, 'credit', 0),
      jsonb_build_object('code', v_credit, 'debit', 0, 'credit', new.amount)
    ),
    new.created_by
  );
  perform private.post_entry_branch(v_entry, new.branch_id);
  return new;
end $$;

create or replace function public.post_expense_entry()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_debit text := '6410';
  v_cash text := '1110';
  v_net numeric;
  v_lines jsonb;
  v_entry uuid;
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

  v_entry := private.post_entry(new.occurred_at,
    'مصروف ' || new.expense_no || ' — ' || new.description,
    'expense', new.id, v_lines, new.created_by);
  perform private.post_entry_branch(v_entry, new.branch_id);
  return new;
end $$;

-- ===== 9) صلاحيات الفروع للمدير =====
insert into public.role_permissions (role_id, permission)
select r.id, p.perm
from public.roles r
cross join (values ('branches.all'), ('branches.manage'), ('inventory.transfer')) as p(perm)
where r.key = 'admin'
on conflict do nothing;