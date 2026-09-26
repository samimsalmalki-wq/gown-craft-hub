-- أنواع الحسابات وصلاحياتها:
-- شاشة «الأدوار والصلاحيات» تصبح المرجع الوحيد للصلاحيات بدل الاعتماد على «مدير أو مشرف».
--  • نطاق الفرع: profiles.branch_id (صلاحية branches.all ترى كل الفروع)
--  • نطاق المراحل: profiles.allowed_stages (فارغة = كل المراحل) لمن يدير المراحل
--  • نطاق أصناف المخزون: roles.material_categories (فارغة = كل الأصناف)
--  • رؤية الطلبات: orders.view_all ترى كل طلبات الفرع، وبدونها يرى الموظف ما سجّله أو ما أُسند إليه

-- ===== 1) أصناف المخزون لكل دور =====
alter table public.roles
  add column if not exists material_categories text[] not null default '{}';

-- ===== 2) دوال النطاق =====

-- الصلاحيات تأتي من الدور والصلاحيات الفردية فقط (بدون استثناء تلقائي للمشرف)
create or replace function private.has_permission(_user_id uuid, _permission text) returns boolean
    language sql stable security definer
    set search_path to 'public'
    as $$
  select private.can(_user_id, _permission)
$$;

-- هل المرحلة ضمن المراحل المسموحة للمستخدم؟
create or replace function private.stage_ok(_uid uuid, _stage text) returns boolean
    language sql stable security definer
    set search_path to 'public'
    as $$
  select private.has_role(_uid, 'admin') or coalesce((
    select cardinality(coalesce(allowed_stages, '{}')) = 0 or _stage = any(allowed_stages)
      from public.profiles where id = _uid
  ), false)
$$;

-- هل صنف المادة ضمن أصناف دور المستخدم؟
create or replace function private.category_ok(_uid uuid, _category text) returns boolean
    language sql stable security definer
    set search_path to 'public'
    as $$
  select private.has_role(_uid, 'admin') or coalesce((
    select cardinality(r.material_categories) = 0
        or coalesce(_category = any(r.material_categories), false)
      from public.profiles p
      join public.roles r on r.id = p.role_id
     where p.id = _uid
  ), true)
$$;

create or replace function private.material_ok(_uid uuid, _material uuid) returns boolean
    language sql stable security definer
    set search_path to 'public'
    as $$
  select private.category_ok(_uid, (select category from public.materials where id = _material))
$$;

-- رؤية الطلب: الفرع + (كل الطلبات، أو ما سجّله، أو ما أُسند إليه)
create or replace function private.order_visible(_uid uuid, _order uuid, _branch uuid, _created_by uuid)
    returns boolean
    language sql stable security definer
    set search_path to 'public'
    as $$
  select private.is_team(_uid)
     and private.branch_ok(_uid, _branch)
     and (
       private.can(_uid, 'orders.view_all')
       or _created_by = _uid
       or exists (select 1 from public.order_stages s where s.order_id = _order and s.assignee_id = _uid)
     )
$$;

create or replace function private.order_visible_id(_uid uuid, _order uuid) returns boolean
    language sql stable security definer
    set search_path to 'public'
    as $$
  select exists (
    select 1 from public.orders o
     where o.id = _order
       and private.order_visible(_uid, o.id, o.branch_id, o.created_by)
  )
$$;

revoke all on function private.stage_ok(uuid, text) from public;
revoke all on function private.category_ok(uuid, text) from public;
revoke all on function private.material_ok(uuid, uuid) from public;
revoke all on function private.order_visible(uuid, uuid, uuid, uuid) from public;
revoke all on function private.order_visible_id(uuid, uuid) from public;
grant execute on function private.stage_ok(uuid, text) to authenticated, service_role;
grant execute on function private.category_ok(uuid, text) to authenticated, service_role;
grant execute on function private.material_ok(uuid, uuid) to authenticated, service_role;
grant execute on function private.order_visible(uuid, uuid, uuid, uuid) to authenticated, service_role;
grant execute on function private.order_visible_id(uuid, uuid) to authenticated, service_role;

-- ===== 3) الطلبات =====
drop policy if exists "orders readable by team" on public.orders;
create policy "orders readable by team" on public.orders
for select to authenticated
using (private.order_visible(auth.uid(), id, branch_id, created_by));

drop policy if exists "orders insert by editors" on public.orders;
drop policy if exists "orders insert by creators" on public.orders;
create policy "orders insert by creators" on public.orders
for insert to authenticated
with check (
  private.can(auth.uid(), 'orders.create')
  and created_by = auth.uid()
  and private.branch_ok(auth.uid(), branch_id)
);

-- التعديل الكامل لمن يملك orders.edit، ومن يعمل على المراحل يحدّث مرحلة الطلب وحالته فقط
drop policy if exists "orders update by editors" on public.orders;
create policy "orders update by editors" on public.orders
for update to authenticated
using (
  private.order_visible(auth.uid(), id, branch_id, created_by)
  and (private.can(auth.uid(), 'orders.edit')
       or private.can(auth.uid(), 'stages.manage')
       or private.can(auth.uid(), 'stages.edit'))
)
with check (
  private.can(auth.uid(), 'orders.edit')
  or private.can(auth.uid(), 'stages.manage')
  or private.can(auth.uid(), 'stages.edit')
);

-- يعمل فقط على التعديل المباشر من التطبيق (الدوال الموثوقة والمشغّلات لا تتأثر)
create or replace function private.guard_order_columns() returns trigger
    language plpgsql
    set search_path to 'public'
    as $$
declare
  v_stage public.orders.current_stage%type := new.current_stage;
  v_state public.orders.state%type := new.state;
  v_scope_at public.orders.scope_set_at%type := new.scope_set_at;
  v_scope_by public.orders.scope_set_by%type := new.scope_set_by;
begin
  if current_user <> 'authenticated' or private.can(auth.uid(), 'orders.edit') then
    return new;
  end if;
  new := old;
  new.current_stage := v_stage;
  new.state := v_state;
  new.scope_set_at := v_scope_at;
  new.scope_set_by := v_scope_by;
  return new;
end $$;

revoke all on function private.guard_order_columns() from public;
grant execute on function private.guard_order_columns() to authenticated;

drop trigger if exists orders_guard_columns on public.orders;
create trigger orders_guard_columns
  before update on public.orders
  for each row execute function private.guard_order_columns();

-- ===== 4) مراحل الطلب =====
-- إنشاء مراحل الطلب الجديد يتم بصلاحية النظام (كانت تفشل لموظفات المبيعات)
alter function public.create_default_stages() security definer;

drop policy if exists "stages readable by team" on public.order_stages;
create policy "stages readable by team" on public.order_stages
for select to authenticated
using (private.order_visible_id(auth.uid(), order_id));

drop policy if exists "stages insert by staff" on public.order_stages;
drop policy if exists "stages insert by managers" on public.order_stages;
create policy "stages insert by managers" on public.order_stages
for insert to authenticated
with check (private.can(auth.uid(), 'stages.manage'));

drop policy if exists "stages update by editors" on public.order_stages;
create policy "stages update by editors" on public.order_stages
for update to authenticated
using (
  (private.can(auth.uid(), 'stages.manage')
     and private.stage_ok(auth.uid(), stage)
     and private.order_visible_id(auth.uid(), order_id))
  or (private.can(auth.uid(), 'stages.edit') and assignee_id = auth.uid())
)
with check (
  (private.can(auth.uid(), 'stages.manage') and private.stage_ok(auth.uid(), stage))
  or (private.can(auth.uid(), 'stages.edit') and assignee_id = auth.uid())
);

create or replace function public.set_order_stage_scope(p_order_id uuid, p_stages text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_gate int;
  v_count int;
begin
  if not (private.can(auth.uid(), 'stages.manage') and private.order_visible_id(auth.uid(), p_order_id)) then
    raise exception 'غير مصرح';
  end if;

  select position into v_gate
    from public.stage_templates
   where is_scope_gate and is_active
   order by position
   limit 1;

  if v_gate is null then
    select min(position) + 5 into v_gate from public.stage_templates where is_active;
  end if;

  update public.order_stages s
     set is_required = (s.stage = any(coalesce(p_stages, '{}'::text[])))
   where s.order_id = p_order_id
     and s.position > v_gate
     and s.status <> 'done';

  update public.order_stages s
     set is_required = true
   where s.order_id = p_order_id
     and s.status = 'done'
     and s.is_required = false;

  select count(*) into v_count
    from public.order_stages
   where order_id = p_order_id and position > v_gate and is_required;

  update public.orders
     set scope_set_at = now(),
         scope_set_by = auth.uid()
   where id = p_order_id;

  perform private.log_activity(p_order_id, null, 'scope_set',
    'تحديد المراحل المطلوبة: ' || v_count::text || ' مرحلة');
end $$;

-- ===== 5) ملفات الطلب =====
drop policy if exists "files readable by team" on public.order_files;
create policy "files readable by team" on public.order_files
for select to authenticated
using (private.order_visible_id(auth.uid(), order_id));

drop policy if exists "files insert by staff" on public.order_files;
drop policy if exists "files insert by uploaders" on public.order_files;
create policy "files insert by uploaders" on public.order_files
for insert to authenticated
with check (
  private.can(auth.uid(), 'files.upload')
  and created_by = auth.uid()
  and private.order_visible_id(auth.uid(), order_id)
  and storage_path like order_id::text || '/%'
);

drop policy if exists "files delete" on public.order_files;
create policy "files delete" on public.order_files
for delete to authenticated
using (private.is_team(auth.uid()) and (created_by = auth.uid() or private.has_role(auth.uid(), 'admin')));

drop policy if exists "order files read" on storage.objects;
create policy "order files read" on storage.objects for select to authenticated
using (bucket_id = 'order-files' and private.is_team(auth.uid()));

drop policy if exists "order files upload" on storage.objects;
create policy "order files upload" on storage.objects for insert to authenticated
with check (
  bucket_id = 'order-files'
  and owner = auth.uid()
  and private.can(auth.uid(), 'files.upload')
  and exists (select 1 from public.orders o where name like o.id::text || '/%')
);

drop policy if exists "order files update" on storage.objects;
create policy "order files update" on storage.objects for update to authenticated
using (bucket_id = 'order-files' and private.is_team(auth.uid())
       and (owner = auth.uid() or private.has_role(auth.uid(), 'admin')))
with check (bucket_id = 'order-files' and private.is_team(auth.uid()));

drop policy if exists "order files delete" on storage.objects;
create policy "order files delete" on storage.objects for delete to authenticated
using (bucket_id = 'order-files' and private.is_team(auth.uid())
       and (owner = auth.uid() or private.has_role(auth.uid(), 'admin')));

-- ===== 6) الدفعات: موظفة المبيعات تحصّل العربون على طلباتها =====
drop policy if exists "finance insert payments" on public.payments;
create policy "finance insert payments" on public.payments
for insert to authenticated
with check (
  private.can(auth.uid(), 'finance.payments')
  or (
    private.can(auth.uid(), 'payments.collect')
    and scope = 'order'
    and order_id is not null
    and created_by = auth.uid()
    and private.order_visible_id(auth.uid(), order_id)
  )
);

drop policy if exists "finance read payments" on public.payments;
create policy "finance read payments" on public.payments
for select to authenticated
using (
  created_by = auth.uid()
  or ((private.can(auth.uid(), 'finance.payments') or private.can(auth.uid(), 'finance.invoices')
       or private.can(auth.uid(), 'finance.reports'))
      and private.branch_ok(auth.uid(), branch_id))
);

drop policy if exists "finance read cash accounts" on public.cash_accounts;
create policy "finance read cash accounts" on public.cash_accounts
for select to authenticated
using ((private.can(auth.uid(), 'finance.expenses') or private.can(auth.uid(), 'finance.payments')
        or private.can(auth.uid(), 'finance.reports') or private.can(auth.uid(), 'payments.collect'))
       and private.branch_ok(auth.uid(), branch_id));

-- ===== 7) المواد والمخزون حسب أصناف الدور =====
drop policy if exists "materials readable by team" on public.materials;
create policy "materials readable by team" on public.materials
for select to authenticated
using (private.is_team(auth.uid()) and private.category_ok(auth.uid(), category));

drop policy if exists "materials insert by managers" on public.materials;
create policy "materials insert by managers" on public.materials
for insert to authenticated
with check (private.can(auth.uid(), 'inventory.manage') and private.category_ok(auth.uid(), category));

drop policy if exists "materials update by managers" on public.materials;
create policy "materials update by managers" on public.materials
for update to authenticated
using (private.can(auth.uid(), 'inventory.manage') and private.category_ok(auth.uid(), category))
with check (private.can(auth.uid(), 'inventory.manage') and private.category_ok(auth.uid(), category));

drop policy if exists "stock readable by team" on public.material_stock;
create policy "stock readable by team" on public.material_stock
for select to authenticated
using (private.is_team(auth.uid()) and private.material_ok(auth.uid(), material_id));

drop policy if exists "stock insert by managers" on public.material_stock;
create policy "stock insert by managers" on public.material_stock
for insert to authenticated
with check (private.can(auth.uid(), 'inventory.manage') and private.material_ok(auth.uid(), material_id));

drop policy if exists "stock update by managers" on public.material_stock;
create policy "stock update by managers" on public.material_stock
for update to authenticated
using (private.can(auth.uid(), 'inventory.manage') and private.material_ok(auth.uid(), material_id))
with check (private.can(auth.uid(), 'inventory.manage') and private.material_ok(auth.uid(), material_id));

drop policy if exists "movements readable by team" on public.material_movements;
create policy "movements readable by team" on public.material_movements
for select to authenticated
using (private.is_team(auth.uid()) and private.material_ok(auth.uid(), material_id));

-- من يسجّل الطلب يحجز خامات الموديل تلقائيًا على طلبه (حجز فقط، بدون صرف)
drop policy if exists "movements insert by managers" on public.material_movements;
create policy "movements insert by managers" on public.material_movements
for insert to authenticated
with check (
  created_by = auth.uid()
  and private.branch_ok(auth.uid(), branch_id)
  and (
    (private.can(auth.uid(), 'inventory.manage') and private.material_ok(auth.uid(), material_id))
    or (kind = 'reserve' and order_id is not null
        and private.can(auth.uid(), 'orders.create')
        and private.order_visible_id(auth.uid(), order_id))
  )
);

drop policy if exists "order materials insert by managers" on public.order_materials;
create policy "order materials insert by managers" on public.order_materials
for insert to authenticated
with check (
  (private.can(auth.uid(), 'inventory.manage') and private.material_ok(auth.uid(), material_id))
  or (private.can(auth.uid(), 'orders.create') and private.order_visible_id(auth.uid(), order_id))
);

drop policy if exists "order materials update by managers" on public.order_materials;
create policy "order materials update by managers" on public.order_materials
for update to authenticated
using (
  (private.can(auth.uid(), 'inventory.manage') and private.material_ok(auth.uid(), material_id))
  or (private.can(auth.uid(), 'orders.create') and private.order_visible_id(auth.uid(), order_id))
)
with check (
  (private.can(auth.uid(), 'inventory.manage') and private.material_ok(auth.uid(), material_id))
  or (private.can(auth.uid(), 'orders.create') and private.order_visible_id(auth.uid(), order_id))
);

drop policy if exists "stock requests readable" on public.stock_requests;
create policy "stock requests readable" on public.stock_requests
for select to authenticated
using (
  private.is_team(auth.uid())
  and (
    private.branch_ok(auth.uid(), to_branch_id)
    or ((private.can(auth.uid(), 'inventory.approve') or private.can(auth.uid(), 'inventory.transfer'))
        and private.material_ok(auth.uid(), material_id))
  )
);

drop policy if exists "stock requests update by approver" on public.stock_requests;
create policy "stock requests update by approver" on public.stock_requests
for update to authenticated
using ((private.can(auth.uid(), 'inventory.approve') or private.can(auth.uid(), 'inventory.transfer'))
       and private.material_ok(auth.uid(), material_id))
with check ((private.can(auth.uid(), 'inventory.approve') or private.can(auth.uid(), 'inventory.transfer'))
            and private.material_ok(auth.uid(), material_id));

create or replace function public.decide_stock_request(
  p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r public.stock_requests; v_avail numeric; v_name text;
begin
  if not (private.can(auth.uid(), 'inventory.approve')
       or private.can(auth.uid(), 'inventory.transfer')) then
    raise exception 'غير مصرح';
  end if;

  select * into r from public.stock_requests where id = p_id for update;
  if r.id is null then raise exception 'الطلب غير موجود'; end if;
  if r.status <> 'pending' then raise exception 'تم اتخاذ قرار في هذا الطلب مسبقًا'; end if;
  if not private.material_ok(auth.uid(), r.material_id) then
    raise exception 'هذا الصنف ليس ضمن الأصناف المسؤول عنها';
  end if;

  if not p_approve then
    update public.stock_requests
       set status = 'rejected', decision_note = p_note,
           decided_by = auth.uid(), decided_at = now()
     where id = p_id;
    return;
  end if;

  select qty_on_hand - qty_reserved into v_avail
    from public.material_stock
   where material_id = r.material_id and branch_id = r.from_branch_id;

  if coalesce(v_avail, 0) < r.qty then
    raise exception 'الكمية المتاحة في المخزن غير كافية';
  end if;

  select name into v_name from public.materials where id = r.material_id;

  insert into public.material_movements (material_id, branch_id, kind, qty, notes, created_by)
  values (r.material_id, r.from_branch_id, 'out', r.qty,
          'صرف على طلب فرع — ' || coalesce(v_name,''), auth.uid());

  insert into public.material_movements (material_id, branch_id, kind, qty, notes, created_by)
  values (r.material_id, r.to_branch_id, 'in', r.qty,
          'استلام من المخزن الرئيسي — ' || coalesce(v_name,''), auth.uid());

  update public.stock_requests
     set status = 'approved', decision_note = p_note,
         decided_by = auth.uid(), decided_at = now()
   where id = p_id;
end $$;

create or replace function public.transfer_material(
  p_material_id uuid, p_from_branch uuid, p_to_branch uuid, p_qty numeric, p_notes text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_avail numeric;
begin
  if not private.can(auth.uid(), 'inventory.transfer') and not private.can(auth.uid(), 'inventory.manage') then
    raise exception 'غير مصرح';
  end if;
  if not private.material_ok(auth.uid(), p_material_id) then
    raise exception 'هذا الصنف ليس ضمن الأصناف المسؤول عنها';
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

-- ===== 8) فساتين الإيجار =====
drop policy if exists "dresses insert by managers" on public.rental_dresses;
create policy "dresses insert by managers" on public.rental_dresses
for insert to authenticated
with check (private.can(auth.uid(), 'rentals.manage') and private.branch_ok(auth.uid(), branch_id));

drop policy if exists "dresses update by managers" on public.rental_dresses;
create policy "dresses update by managers" on public.rental_dresses
for update to authenticated
using (private.can(auth.uid(), 'rentals.manage') and private.branch_ok(auth.uid(), branch_id))
with check (private.can(auth.uid(), 'rentals.manage') and private.branch_ok(auth.uid(), branch_id));

drop policy if exists "rentals readable by team" on public.rental_records;
create policy "rentals readable by team" on public.rental_records
for select to authenticated
using (private.is_team(auth.uid()) and private.branch_ok(auth.uid(), branch_id));

drop policy if exists "rentals insert by managers" on public.rental_records;
create policy "rentals insert by managers" on public.rental_records
for insert to authenticated
with check (private.can(auth.uid(), 'rentals.manage') and created_by = auth.uid()
            and private.branch_ok(auth.uid(), branch_id));

drop policy if exists "rentals update by managers" on public.rental_records;
create policy "rentals update by managers" on public.rental_records
for update to authenticated
using (private.can(auth.uid(), 'rentals.manage') and private.branch_ok(auth.uid(), branch_id))
with check (private.can(auth.uid(), 'rentals.manage') and private.branch_ok(auth.uid(), branch_id));

CREATE OR REPLACE FUNCTION public.deliver_rental_order(p_order_id uuid, p_due_date date DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_order public.orders;
  v_dress uuid;
  v_branch uuid;
  v_code text;
begin
  if not private.can(auth.uid(), 'rentals.manage') then
    raise exception 'غير مصرح';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'الطلب غير موجود';
  end if;
  if v_order.order_kind = 'own' then
    raise exception 'هذا الطلب تفصيل ملك ولا يدخل مخزون الإيجار';
  end if;

  select id into v_dress from public.rental_dresses where source_order_id = p_order_id limit 1;

  v_branch := coalesce(v_order.branch_id, (select id from public.branches where is_main limit 1));
  v_code := 'R-' || v_order.order_no;

  if v_dress is null then
    insert into public.rental_dresses (
      code, model_no, size, color, rent_price, deposit_amount, status,
      notes, branch_id, source_order_id, created_by
    ) values (
      v_code,
      v_order.model_no,
      null,
      null,
      v_order.total_amount,
      v_order.security_deposit,
      case when v_order.order_kind = 'rental' then 'rented'::public.rental_dress_status
           else 'available'::public.rental_dress_status end,
      'أُنتج بطلب ' || v_order.order_no,
      v_branch,
      p_order_id,
      auth.uid()
    ) returning id into v_dress;
  end if;

  if v_order.order_kind = 'rental'
     and not exists (select 1 from public.rental_records where order_id = p_order_id) then
    insert into public.rental_records (
      dress_id, order_id, client_name, client_phone, out_date, due_date,
      amount, deposit_amount, notes, branch_id, created_by
    ) values (
      v_dress, p_order_id, v_order.client_name, v_order.client_phone,
      current_date, coalesce(p_due_date, current_date + 7),
      v_order.total_amount, v_order.security_deposit,
      'تسليم طلب تفصيل إيجار ' || v_order.order_no,
      v_branch, auth.uid()
    );
  end if;

  update public.orders
     set state = 'delivered'
   where id = p_order_id and state <> 'delivered';

  perform private.log_activity(p_order_id, null, 'rental_stock_in',
    'دخول الفستان مخزون الإيجار بكود ' || v_code);

  return v_dress;
end $$;

CREATE OR REPLACE FUNCTION public.close_rental_return(
  p_record_id uuid,
  p_condition text DEFAULT 'ok',
  p_damage numeric DEFAULT 0,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_rec public.rental_records;
  v_damage numeric := greatest(coalesce(p_damage, 0), 0);
  v_deposit numeric;
  v_refund numeric;
  v_entry uuid;
  v_lines jsonb;
begin
  if not private.can(auth.uid(), 'rentals.manage') then
    raise exception 'غير مصرح';
  end if;

  select * into v_rec from public.rental_records where id = p_record_id;
  if v_rec.id is null then
    raise exception 'العقد غير موجود';
  end if;
  if v_rec.returned_at is not null then
    raise exception 'العقد مُرجَع مسبقًا';
  end if;

  v_deposit := coalesce(v_rec.deposit_amount, 0);
  if v_damage > v_deposit then
    v_damage := v_deposit;
  end if;
  v_refund := v_deposit - v_damage;

  update public.rental_records
     set returned_at = current_date,
         return_condition = coalesce(p_condition, 'ok'),
         damage_amount = v_damage,
         notes = coalesce(p_note, notes)
   where id = p_record_id;

  if v_deposit > 0 then
    v_lines := jsonb_build_array(
      jsonb_build_object('code', '2120', 'debit', v_deposit, 'credit', 0, 'memo', 'رد تأمين الإيجار')
    );
    if v_refund > 0 then
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object('code', '1110', 'debit', 0, 'credit', v_refund, 'memo', 'مبلغ مُرد للعميلة')
      );
    end if;
    if v_damage > 0 then
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object('code', '4210', 'debit', 0, 'credit', v_damage, 'memo', 'خصم تلف أو تنظيف')
      );
    end if;

    v_entry := private.post_entry(current_date,
      'إرجاع فستان إيجار — عقد ' || v_rec.id::text,
      'rental_return', p_record_id, v_lines, auth.uid());
    perform private.post_entry_branch(v_entry, v_rec.branch_id);
  end if;

  if v_rec.order_id is not null then
    perform private.log_activity(v_rec.order_id, null, 'rental_returned',
      case when v_damage > 0 then 'أُرجع الفستان بخصم تلف' else 'أُرجع الفستان سليمًا' end);
  end if;
end $$;

-- ===== 9) الكتالوج: الموديلات وأنواع القطع وتصنيفات المواد =====
drop policy if exists "managers add models" on public.models;
create policy "managers add models" on public.models
for insert to authenticated with check (private.can(auth.uid(), 'catalog.manage'));
drop policy if exists "managers update models" on public.models;
create policy "managers update models" on public.models
for update to authenticated
using (private.can(auth.uid(), 'catalog.manage')) with check (private.can(auth.uid(), 'catalog.manage'));

drop policy if exists "managers write model materials" on public.model_materials;
create policy "managers write model materials" on public.model_materials
for insert to authenticated with check (private.can(auth.uid(), 'catalog.manage'));
drop policy if exists "managers update model materials" on public.model_materials;
create policy "managers update model materials" on public.model_materials
for update to authenticated
using (private.can(auth.uid(), 'catalog.manage')) with check (private.can(auth.uid(), 'catalog.manage'));
drop policy if exists "managers delete model materials" on public.model_materials;
create policy "managers delete model materials" on public.model_materials
for delete to authenticated using (private.can(auth.uid(), 'catalog.manage'));

drop policy if exists "managers write model images" on public.model_images;
create policy "managers write model images" on public.model_images
for insert to authenticated with check (private.can(auth.uid(), 'catalog.manage'));
drop policy if exists "managers delete model images" on public.model_images;
create policy "managers delete model images" on public.model_images
for delete to authenticated using (private.can(auth.uid(), 'catalog.manage'));

drop policy if exists "managers add item types" on public.item_types;
create policy "managers add item types" on public.item_types
for insert to authenticated with check (private.can(auth.uid(), 'catalog.manage'));
drop policy if exists "managers update item types" on public.item_types;
create policy "managers update item types" on public.item_types
for update to authenticated using (private.can(auth.uid(), 'catalog.manage'));

drop policy if exists "managers add material categories" on public.material_categories;
create policy "managers add material categories" on public.material_categories
for insert to authenticated with check (private.can(auth.uid(), 'catalog.manage'));
drop policy if exists "managers update material categories" on public.material_categories;
create policy "managers update material categories" on public.material_categories
for update to authenticated using (private.can(auth.uid(), 'catalog.manage'));

-- رسائل الواتساب الجاهزة
drop policy if exists "managers can insert whatsapp templates" on public.whatsapp_templates;
create policy "managers can insert whatsapp templates" on public.whatsapp_templates
for insert to authenticated with check (private.can(auth.uid(), 'whatsapp.manage'));
drop policy if exists "managers can update whatsapp templates" on public.whatsapp_templates;
create policy "managers can update whatsapp templates" on public.whatsapp_templates
for update to authenticated
using (private.can(auth.uid(), 'whatsapp.manage')) with check (private.can(auth.uid(), 'whatsapp.manage'));

-- صور المخزون والإيجار والموديلات
drop policy if exists "inventory images insert by managers" on storage.objects;
create policy "inventory images insert by managers" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'inventory' and owner = auth.uid()
  and (private.can(auth.uid(), 'inventory.manage') or private.can(auth.uid(), 'rentals.manage')
       or private.can(auth.uid(), 'catalog.manage'))
);

drop policy if exists "inventory images update by managers" on storage.objects;
create policy "inventory images update by managers" on storage.objects
for update to authenticated
using (bucket_id = 'inventory'
       and (private.can(auth.uid(), 'inventory.manage') or private.can(auth.uid(), 'rentals.manage')
            or private.can(auth.uid(), 'catalog.manage')))
with check (bucket_id = 'inventory'
       and (private.can(auth.uid(), 'inventory.manage') or private.can(auth.uid(), 'rentals.manage')
            or private.can(auth.uid(), 'catalog.manage')));

drop policy if exists "inventory images delete by managers" on storage.objects;
create policy "inventory images delete by managers" on storage.objects
for delete to authenticated
using (bucket_id = 'inventory'
       and (private.can(auth.uid(), 'inventory.manage') or private.can(auth.uid(), 'rentals.manage')
            or private.can(auth.uid(), 'catalog.manage')));

-- ===== 10) أنواع الحسابات =====
-- كل أعضاء الفريق (ومنهم موظفات المبيعات) يقرؤون كتالوج الأدوار ليعرف التطبيق صلاحياتهم
drop policy if exists "team can read roles" on public.roles;
create policy "team can read roles" on public.roles
for select to authenticated using (private.is_team(auth.uid()));

drop policy if exists "team can read role permissions" on public.role_permissions;
create policy "team can read role permissions" on public.role_permissions
for select to authenticated using (private.is_team(auth.uid()));

-- أسماء الأدوار الأساسية (إذا لم يغيّرها المدير)
update public.roles set label = 'مشرف فرع'      where key = 'supervisor' and label = 'مشرف';
update public.roles set label = 'عاملة إنتاج'   where key = 'staff'      and label = 'موظف';
update public.roles set label = 'موظفة مبيعات' where key = 'cs'         and label = 'خدمة عملاء';

insert into public.roles (key, label, position, is_builtin, material_categories) values
  ('accountant',       'محاسب عام',               5, false, '{}'),
  ('warehouse_fabric', 'مسؤول مستودع الأقمشة',     6, false, '{fabric}'),
  ('warehouse_lace',   'مسؤول مستودع الدانتيلات', 7, false, '{lace}')
on conflict (key) do nothing;

-- الصلاحيات الافتراضية (تُضاف فقط، ولا يُحذف ما حدّده المدير)
insert into public.role_permissions (role_id, permission)
select r.id, p.perm
  from public.roles r
  join (values
    ('supervisor','orders.create'),('supervisor','orders.edit'),('supervisor','orders.view_all'),
    ('supervisor','files.upload'),('supervisor','finance.view'),('supervisor','stages.manage'),
    ('supervisor','stages.edit'),('supervisor','inventory.manage'),('supervisor','inventory.request'),
    ('supervisor','rentals.manage'),('supervisor','whatsapp.manage'),('supervisor','reports.view'),
    ('supervisor','catalog.manage'),
    ('staff','stages.edit'),('staff','files.upload'),
    ('cs','orders.create'),('cs','orders.edit'),('cs','files.upload'),('cs','finance.view'),
    ('cs','payments.collect'),
    ('accountant','finance.view'),('accountant','finance.payments'),('accountant','finance.invoices'),
    ('accountant','finance.expenses'),('accountant','finance.accounts'),('accountant','finance.reports'),
    ('accountant','branches.all'),('accountant','orders.view_all'),('accountant','inventory.manage'),
    ('accountant','inventory.approve'),('accountant','inventory.transfer'),
    ('warehouse_fabric','inventory.manage'),('warehouse_fabric','inventory.approve'),
    ('warehouse_fabric','inventory.transfer'),
    ('warehouse_lace','inventory.manage'),('warehouse_lace','inventory.approve'),
    ('warehouse_lace','inventory.transfer')
  ) as p(role_key, perm) on p.role_key = r.key
on conflict (role_id, permission) do nothing;
