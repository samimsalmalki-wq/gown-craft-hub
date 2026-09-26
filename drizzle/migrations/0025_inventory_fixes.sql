-- إصلاحات المخزون (يُشغَّل بعد 0023 و0024)
-- أولًا: الخامات
--  • الصرف اليدوي والنقل بين المواقع ما يمسّ حجوزات الطلبات، ويُقارن بالمتاح (الموجود − المحجوز).
--  • الصرف على طلب يستهلك حجز نفس الطلب فقط (consume_reserved).
--  • الحجز والصرف والتحرير لطلب تتم بدالة واحدة (كلها أو لا شيء)، وفي موقع ثابت محفوظ على سطر الطلب.
--  • النقل بين المواقع ما يُسجَّل تكلفة إنتاج (وتصحيح ما سُجّل سابقًا).
--  • تسليم الطلب أو إلغاؤه يحرّر ما بقي من حجوزاته.
--  • تصحيح الحجوزات القديمة ومطابقة المجاميع.
-- ثانيًا: المخزون الجاهز
--  • تأشير كل قطعة لوحدها عند إرسال أكثر من فستان من نفس الصنف، واستلام جزء من الكمية.
--  • إرسال القطع الناقصة لاحقًا بشحنة مرتبطة بالنقص.
--  • ما يُسلَّم الطلب للعميلة وفستانه للحين في المعمل أو الطريق.
--  • البيع بأقل من السعر المفترض بصلاحية، ومرتجع البيع (رجوع القطعة وسند صرف وقيد عكسي)،
--    وفاتورة البيع ما تنلغى من الماليات (المرتجع بدالها).
--  • سعر التكلفة للأصناف.
--  • الإرسال من المعمل وتعديل كمياته لموظفي المعمل فقط.
-- ثالثًا: قطع فستان الإيجار تتأشّر عند خروجه ورجوعه، والناقص يُسجَّل للمتابعة.

-- ===================== أولًا: الخامات =====================

alter table public.material_movements
  add column if not exists is_transfer boolean not null default false,
  add column if not exists consume_reserved numeric;

alter table public.order_materials
  add column if not exists branch_id uuid references public.branches(id);

-- حركات النقل السابقة (من ملاحظاتها)
update public.material_movements
   set is_transfer = true
 where not is_transfer
   and (notes like '%نقل إلى فرع آخر%' or notes like '%نقل من فرع آخر%'
        or notes like 'صرف على طلب فرع%' or notes like 'استلام من المخزن الرئيسي%');

-- ===== 1) تطبيق الحركة على الموقع =====
create or replace function public.apply_material_movement()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_name text;
  v_unit text;
  v_min numeric;
  v_branch uuid;
  v_on numeric;
  v_res numeric;
  v_consume numeric := 0;
  v_release numeric := 0;
begin
  select name, unit, min_qty into v_name, v_unit, v_min
    from public.materials where id = new.material_id;
  v_branch := coalesce(new.branch_id, (select id from public.branches where is_main limit 1));

  insert into public.material_stock (material_id, branch_id, min_qty)
  values (new.material_id, v_branch, coalesce(v_min, 0))
  on conflict (material_id, branch_id) do nothing;

  select qty_on_hand, qty_reserved into v_on, v_res
    from public.material_stock
   where material_id = new.material_id and branch_id = v_branch
   for update;

  if new.kind = 'out' then
    -- الصرف على طلب يستهلك حجزه فقط؛ الصرف اليدوي والنقل ما يمسّ الحجوزات
    -- (الحركات القديمة بدون consume_reserved: الصرف على طلب يستهلك بقدر الكمية)
    v_consume := least(
      greatest(coalesce(new.consume_reserved,
                        case when new.order_id is not null and not new.is_transfer then new.qty else 0 end), 0),
      new.qty, v_res);
    if v_on - v_res + v_consume < new.qty then
      raise exception 'الكمية المطلوبة (%) أكبر من المتاح في هذا الموقع (%) من % — الباقي محجوز لطلبات',
        new.qty::text, greatest(v_on - v_res + v_consume, 0)::text, coalesce(v_name, 'المادة')
        using errcode = 'check_violation';
    end if;
  elsif new.kind = 'reserve' then
    if v_on - v_res < new.qty then
      raise exception 'الكمية المطلوبة (%) أكبر من المتاح في هذا الموقع (%) من %',
        new.qty::text, greatest(v_on - v_res, 0)::text, coalesce(v_name, 'المادة')
        using errcode = 'check_violation';
    end if;
  elsif new.kind = 'release' then
    v_release := least(new.qty, v_res);
  end if;

  if new.kind = 'in' then
    update public.material_stock set qty_on_hand = qty_on_hand + new.qty
     where material_id = new.material_id and branch_id = v_branch;
    update public.materials set qty_on_hand = qty_on_hand + new.qty where id = new.material_id;
  elsif new.kind = 'out' then
    update public.material_stock
       set qty_on_hand = qty_on_hand - new.qty, qty_reserved = qty_reserved - v_consume
     where material_id = new.material_id and branch_id = v_branch;
    update public.materials
       set qty_on_hand = qty_on_hand - new.qty,
           qty_reserved = greatest(0, qty_reserved - v_consume)
     where id = new.material_id;
  elsif new.kind = 'reserve' then
    update public.material_stock set qty_reserved = qty_reserved + new.qty
     where material_id = new.material_id and branch_id = v_branch;
    update public.materials set qty_reserved = qty_reserved + new.qty where id = new.material_id;
  elsif new.kind = 'release' then
    update public.material_stock set qty_reserved = qty_reserved - v_release
     where material_id = new.material_id and branch_id = v_branch;
    update public.materials set qty_reserved = greatest(0, qty_reserved - v_release)
     where id = new.material_id;
  end if;

  if new.order_id is not null then
    perform private.log_activity(new.order_id, null, 'material_' || new.kind::text,
      coalesce(v_name,'مادة') || ' — ' || new.qty::text || ' ' || coalesce(v_unit,''));
  end if;
  return new;
end $function$;

-- ===== 2) قيد التكلفة: الاستهلاك فقط (مو النقل بين المواقع) =====
create or replace function public.post_material_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_cost numeric; v_name text; v_entry uuid;
begin
  if new.kind <> 'out' or new.is_transfer then
    return new;
  end if;
  select unit_cost, name into v_cost, v_name from public.materials where id = new.material_id;
  if coalesce(v_cost, 0) <= 0 then
    return new;
  end if;

  v_entry := private.post_entry(new.created_at::date,
    'صرف خامة: ' || coalesce(v_name, '') || ' × ' || new.qty::text,
    'material_out', new.id,
    jsonb_build_array(
      jsonb_build_object('code', '5110', 'debit', round(new.qty * v_cost, 2), 'credit', 0),
      jsonb_build_object('code', '1310', 'debit', 0, 'credit', round(new.qty * v_cost, 2))
    ),
    new.created_by);
  perform private.post_entry_branch(v_entry, new.branch_id);
  return new;
end $$;

-- تصحيح قيود تكلفة سُجّلت على نقل بين المواقع
do $$
declare
  r record;
  v_lines jsonb;
  v_entry uuid;
begin
  for r in
    select e.id as entry_id, m.id as movement_id, e.branch_id
      from public.material_movements m
      join public.journal_entries e on e.source = 'material_out' and e.source_id = m.id
     where m.is_transfer and m.kind = 'out'
       and not exists (select 1 from public.journal_entries x
                        where x.source = 'material_out_fix' and x.source_id = m.id)
  loop
    select jsonb_agg(jsonb_build_object('code', a.code, 'debit', l.credit, 'credit', l.debit))
      into v_lines
      from public.journal_lines l
      join public.gl_accounts a on a.id = l.account_id
     where l.entry_id = r.entry_id;
    if v_lines is not null then
      v_entry := private.post_entry(current_date,
        'تصحيح: نقل خامات بين المواقع ليس تكلفة إنتاج', 'material_out_fix', r.movement_id, v_lines, null);
      perform private.post_entry_branch(v_entry, r.branch_id);
    end if;
  end loop;
end $$;

-- ===== 3) النقل بين المواقع وطلبات الصرف =====
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

  insert into public.material_movements (material_id, branch_id, kind, qty, notes, created_by, is_transfer)
  values (p_material_id, p_from_branch, 'out', p_qty,
          ltrim(coalesce(p_notes, '') || ' — نقل إلى فرع آخر', ' —'), auth.uid(), true);

  insert into public.material_movements (material_id, branch_id, kind, qty, notes, created_by, is_transfer)
  values (p_material_id, p_to_branch, 'in', p_qty,
          ltrim(coalesce(p_notes, '') || ' — نقل من فرع آخر', ' —'), auth.uid(), true);
end $$;

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

  insert into public.material_movements (material_id, branch_id, kind, qty, notes, created_by, is_transfer)
  values (r.material_id, r.from_branch_id, 'out', r.qty,
          'صرف على طلب فرع — ' || coalesce(v_name,''), auth.uid(), true);

  insert into public.material_movements (material_id, branch_id, kind, qty, notes, created_by, is_transfer)
  values (r.material_id, r.to_branch_id, 'in', r.qty,
          'استلام من المخزن الرئيسي — ' || coalesce(v_name,''), auth.uid(), true);

  update public.stock_requests
     set status = 'approved', decision_note = p_note,
         decided_by = auth.uid(), decided_at = now()
   where id = p_id;
end $$;

-- ===== 4) حجز وصرف وتحرير خامات الطلب (عملية وحدة) =====
-- موقع الحجز: موقع السطر إن وُجد، وإلا فرع الطلب، وإلا الفرع الرئيسي
create or replace function public.reserve_order_material(
  p_order_id uuid, p_material_id uuid, p_qty numeric, p_notes text default null
) returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  o public.orders;
  r public.order_materials;
  v_branch uuid;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if coalesce(p_qty, 0) <= 0 then
    raise exception 'الكمية لازم تكون أكبر من صفر';
  end if;
  select * into o from public.orders where id = p_order_id;
  if o.id is null then
    raise exception 'الطلب غير موجود';
  end if;
  if not ((private.can(auth.uid(), 'inventory.manage') and private.material_ok(auth.uid(), p_material_id))
          or (private.can(auth.uid(), 'orders.create') and private.order_visible_id(auth.uid(), o.id))) then
    raise exception 'غير مصرح';
  end if;

  select * into r from public.order_materials
   where order_id = o.id and material_id = p_material_id
   for update;
  v_branch := coalesce(r.branch_id, o.branch_id, (select id from public.branches where is_main limit 1));

  if r.id is null then
    insert into public.order_materials (order_id, material_id, qty_reserved, notes, created_by, branch_id)
    values (o.id, p_material_id, p_qty, v_notes, auth.uid(), v_branch);
  else
    update public.order_materials
       set qty_reserved = qty_reserved + p_qty,
           notes = coalesce(v_notes, notes),
           branch_id = v_branch
     where id = r.id;
  end if;

  insert into public.material_movements (material_id, order_id, kind, qty, notes, branch_id, created_by)
  values (p_material_id, o.id, 'reserve', p_qty, v_notes, v_branch, auth.uid());
end $$;

create or replace function public.issue_order_material(p_row_id uuid, p_qty numeric) returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  r public.order_materials;
  v_branch uuid;
  v_consume numeric;
begin
  if coalesce(p_qty, 0) <= 0 then
    raise exception 'الكمية لازم تكون أكبر من صفر';
  end if;
  select * into r from public.order_materials where id = p_row_id for update;
  if r.id is null then
    raise exception 'السطر غير موجود';
  end if;
  if not (private.can(auth.uid(), 'inventory.manage') and private.material_ok(auth.uid(), r.material_id)) then
    raise exception 'غير مصرح';
  end if;
  v_branch := coalesce(r.branch_id, (select branch_id from public.orders where id = r.order_id),
                       (select id from public.branches where is_main limit 1));
  v_consume := least(p_qty, r.qty_reserved);

  update public.order_materials
     set qty_issued = qty_issued + p_qty, qty_reserved = qty_reserved - v_consume, branch_id = v_branch
   where id = r.id;

  insert into public.material_movements
    (material_id, order_id, kind, qty, notes, branch_id, created_by, consume_reserved)
  values
    (r.material_id, r.order_id, 'out', p_qty, 'صرف على الطلب', v_branch, auth.uid(), v_consume);
end $$;

create or replace function public.release_order_material(p_row_id uuid) returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  r public.order_materials;
  v_branch uuid;
begin
  select * into r from public.order_materials where id = p_row_id for update;
  if r.id is null or r.qty_reserved <= 0 then
    return;
  end if;
  if not (private.can(auth.uid(), 'inventory.manage') and private.material_ok(auth.uid(), r.material_id)) then
    raise exception 'غير مصرح';
  end if;
  v_branch := coalesce(r.branch_id, (select branch_id from public.orders where id = r.order_id),
                       (select id from public.branches where is_main limit 1));

  update public.order_materials set qty_reserved = 0, branch_id = v_branch where id = r.id;

  insert into public.material_movements (material_id, order_id, kind, qty, notes, branch_id, created_by)
  values (r.material_id, r.order_id, 'release', r.qty_reserved, 'تحرير حجز', v_branch, auth.uid());
end $$;

revoke all on function public.reserve_order_material(uuid, uuid, numeric, text) from public, anon;
revoke all on function public.issue_order_material(uuid, numeric) from public, anon;
revoke all on function public.release_order_material(uuid) from public, anon;
grant execute on function public.reserve_order_material(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.issue_order_material(uuid, numeric) to authenticated;
grant execute on function public.release_order_material(uuid) to authenticated;

-- ===== 5) تسليم الطلب أو إلغاؤه يحرّر ما بقي من حجوزاته =====
create or replace function private.release_finished_order_materials() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  r public.order_materials;
begin
  if new.state = 'active' or old.state <> 'active' then
    return new;
  end if;
  for r in select * from public.order_materials where order_id = new.id and qty_reserved > 0 loop
    update public.order_materials set qty_reserved = 0 where id = r.id;
    insert into public.material_movements (material_id, order_id, kind, qty, notes, branch_id, created_by)
    values (r.material_id, r.order_id, 'release', r.qty_reserved,
            case when new.state = 'cancelled' then 'تحرير حجز — الطلب ملغي' else 'تحرير حجز — الطلب مسلَّم' end,
            coalesce(r.branch_id, new.branch_id), auth.uid());
  end loop;
  return new;
end $$;

revoke all on function private.release_finished_order_materials() from public;

drop trigger if exists orders_release_materials on public.orders;
create trigger orders_release_materials after update of state on public.orders
  for each row execute function private.release_finished_order_materials();

-- ===== 6) تصحيح الحجوزات القديمة ومطابقة المجاميع =====
update public.order_materials om
   set branch_id = coalesce(o.branch_id, (select id from public.branches where is_main limit 1))
  from public.orders o
 where o.id = om.order_id and om.branch_id is null;

-- حجز بقي على طلب منتهي، أو على سطر انصرف بالكامل من نسخة قديمة
-- (فقط لما يكون محجوز الطلبات أكبر من محجوز الموقع)
update public.order_materials om
   set qty_reserved = 0
  from public.orders o
 where o.id = om.order_id
   and om.qty_reserved > 0
   and (o.state <> 'active'
        or (om.qty_issued > 0 and om.qty_issued >= om.qty_reserved
            and (select coalesce(sum(x.qty_reserved), 0) from public.order_materials x
                  where x.material_id = om.material_id and x.branch_id = om.branch_id)
              > (select coalesce(sum(s.qty_reserved), 0) from public.material_stock s
                  where s.material_id = om.material_id and s.branch_id = om.branch_id)));

-- محجوز كل موقع = حجوزات الطلبات المفتوحة فيه
update public.material_stock s
   set qty_reserved = coalesce((
     select sum(om.qty_reserved)
       from public.order_materials om
       join public.orders o on o.id = om.order_id
      where om.material_id = s.material_id and om.branch_id = s.branch_id and o.state = 'active'
   ), 0);

-- مجاميع المادة = مجموع مواقعها
update public.materials m
   set qty_on_hand = coalesce((select sum(qty_on_hand) from public.material_stock where material_id = m.id), 0),
       qty_reserved = coalesce((select sum(qty_reserved) from public.material_stock where material_id = m.id), 0);

-- ===================== ثانيًا: المخزون الجاهز =====================

alter table public.goods_items
  add column if not exists cost numeric(12,2) not null default 0;

-- الإرسال من المعمل وتعديل كمياته لموظفي المعمل (المستودع الرئيسي) أو من له كل الفروع؛
-- موظف الفرع يشوف جاهز فرعه في المعمل بس ما يتصرف فيه
create or replace function private.workshop_ok(_uid uuid) returns boolean
    language sql stable security definer
    set search_path to 'public'
    as $$
  select private.can_all_branches(_uid) or private.at_warehouse(_uid)
$$;

revoke all on function private.workshop_ok(uuid) from public;
grant execute on function private.workshop_ok(uuid) to authenticated, service_role;

create or replace function public.goods_adjust(
  p_item_id uuid,
  p_branch_id uuid,
  p_at_workshop boolean,
  p_delta integer,
  p_notes text default null
) returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_qty integer;
begin
  if not private.can(auth.uid(), 'goods.manage') then
    raise exception 'غير مصرح';
  end if;
  if coalesce(p_at_workshop, false) then
    if not private.workshop_ok(auth.uid()) then
      raise exception 'كميات المعمل يعدّلها موظفو المعمل';
    end if;
  elsif not private.branch_ok(auth.uid(), p_branch_id) then
    raise exception 'غير مصرح لهذا الفرع';
  end if;
  if coalesce(p_delta, 0) = 0 then
    return;
  end if;
  if exists (select 1 from public.branches where id = p_branch_id and is_warehouse) then
    raise exception 'اختر فرع بيع (الكمية في المعمل تكون مخصصة لفرع)';
  end if;

  insert into public.goods_stock (item_id, branch_id, at_workshop, qty)
  values (p_item_id, p_branch_id, coalesce(p_at_workshop, false), 0)
  on conflict (item_id, branch_id, at_workshop) do nothing;

  select qty into v_qty from public.goods_stock
   where item_id = p_item_id and branch_id = p_branch_id and at_workshop = coalesce(p_at_workshop, false)
   for update;
  if v_qty + p_delta < 0 then
    raise exception 'الكمية المتوفرة % فقط', v_qty;
  end if;

  update public.goods_stock
     set qty = qty + p_delta, updated_at = now()
   where item_id = p_item_id and branch_id = p_branch_id and at_workshop = coalesce(p_at_workshop, false);

  insert into public.goods_movements (item_id, branch_id, at_workshop, qty, kind, notes, created_by)
  values (p_item_id, p_branch_id, coalesce(p_at_workshop, false), p_delta,
          case when p_delta > 0 then 'in' else 'adjust' end,
          nullif(btrim(coalesce(p_notes, '')), ''), auth.uid());
end $$;

alter table public.goods_movements drop constraint if exists goods_movements_kind_check;
alter table public.goods_movements add constraint goods_movements_kind_check
  check (kind in ('in', 'adjust', 'send', 'receive', 'sale', 'return'));

alter table public.goods_transfer_lines
  -- صنف ينعدّ بالكمية (يُستلم بعدد)، والقطع الأساسية لكل وحدة (لحساب ما وصل)
  add column if not exists is_count boolean not null default false,
  add column if not exists units text[],
  add column if not exists received_qty integer,
  -- شحنة لقطع ناقصة من شحنة سابقة (بدون حركة كمية)
  add column if not exists followup_issue_id uuid references public.part_issues(id) on delete set null;

-- قائمة التأشير لصنف: القطع لكل وحدة، أو سطر واحد بالكمية للأصناف اللي تنعدّ
create or replace function private.goods_checklist(_name text, _parts text[], _qty integer)
returns text[] language sql immutable as $$
  select case
    when cardinality(coalesce(_parts, '{}')) = 0 then array[_name || ' × ' || _qty]
    when _qty <= 1 then _parts
    else array(
      select p || ' (' || n || ')'
        from generate_series(1, _qty) as n, unnest(_parts) with ordinality as u(p, i)
       order by n, i)
  end
$$;

create or replace function private.goods_units(_parts text[], _qty integer)
returns text[] language sql immutable as $$
  select case
    when cardinality(coalesce(_parts, '{}')) = 0 then null
    when _qty <= 1 then array[_parts[1]]
    else array(select _parts[1] || ' (' || n || ')' from generate_series(1, _qty) as n order by n)
  end
$$;

-- ===== 7) إرسال شحنة (قطع كل وحدة لحالها) =====
create or replace function public.send_goods(
  p_from_branch uuid,
  p_from_workshop boolean,
  p_to_branch uuid,
  p_lines jsonb,
  p_notes text default null
) returns uuid
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_transfer uuid;
  v_to_name text;
  v_line jsonb;
  v_pos integer := 0;
  v_item public.goods_items;
  v_order public.orders;
  v_qty integer;
  v_have integer;
  v_check text[];
  v_units text[];
  v_count boolean;
  v_sent text[];
  v_title text;
  v_line_id uuid;
begin
  if not private.can(auth.uid(), 'goods.transfer') then
    raise exception 'غير مصرح';
  end if;
  if coalesce(p_from_workshop, false) then
    if not private.workshop_ok(auth.uid()) then
      raise exception 'الإرسال من المعمل لموظفي المعمل';
    end if;
  elsif not private.branch_ok(auth.uid(), p_from_branch) then
    raise exception 'غير مصرح لهذا الموقع';
  end if;
  select name into v_to_name from public.branches where id = p_to_branch and not is_warehouse;
  if v_to_name is null then
    raise exception 'اختر الفرع المستلم';
  end if;
  if not coalesce(p_from_workshop, false) and p_from_branch = p_to_branch then
    raise exception 'الفرع المرسل والمستلم نفس الفرع';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'ما فيه شي للإرسال';
  end if;

  insert into public.goods_transfers
    (transfer_no, from_branch_id, from_workshop, to_branch_id, notes, sent_by)
  values
    ('T-' || lpad(nextval('public.goods_transfer_seq')::text, 5, '0'),
     p_from_branch, coalesce(p_from_workshop, false), p_to_branch,
     nullif(btrim(coalesce(p_notes, '')), ''), auth.uid())
  returning id into v_transfer;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_pos := v_pos + 1;
    v_sent := coalesce(array(select jsonb_array_elements_text(v_line->'sent')), '{}');
    v_units := null;
    v_count := false;

    if v_line ? 'order_id' then
      select * into v_order from public.orders where id = (v_line->>'order_id')::uuid for update;
      if v_order.id is null or v_order.state <> 'active' then
        raise exception 'الطلب غير موجود أو مسلَّم';
      end if;
      if v_order.dress_location <> (case when p_from_workshop then 'workshop' else 'branch' end)
         or (not p_from_workshop and v_order.branch_id is distinct from p_from_branch) then
        raise exception 'الطلب % مو موجود في هذا الموقع', v_order.order_no;
      end if;
      if v_order.branch_id is not null and v_order.branch_id <> p_to_branch then
        raise exception 'الطلب % تابع لفرع آخر', v_order.order_no;
      end if;
      v_qty := 1;
      v_check := private.parts_or_dress(v_order.parts);
      v_title := 'طلب ' || v_order.order_no || ' — ' || v_order.client_name;
      update public.orders set dress_location = 'transit' where id = v_order.id;
      perform private.log_activity(v_order.id, null, 'dress_sent', 'أُرسل الفستان إلى فرع ' || v_to_name);
    else
      select * into v_item from public.goods_items where id = (v_line->>'item_id')::uuid;
      if v_item.id is null then
        raise exception 'الصنف غير موجود';
      end if;
      v_qty := coalesce((v_line->>'qty')::integer, 1);
      if v_qty <= 0 then
        raise exception 'الكمية لازم تكون أكبر من صفر';
      end if;
      select qty into v_have from public.goods_stock
       where item_id = v_item.id and branch_id = p_from_branch
         and at_workshop = coalesce(p_from_workshop, false)
       for update;
      if coalesce(v_have, 0) < v_qty then
        raise exception 'المتوفر من «%» % فقط', v_item.name, coalesce(v_have, 0);
      end if;
      v_check := private.goods_checklist(v_item.name, v_item.parts, v_qty);
      v_units := private.goods_units(v_item.parts, v_qty);
      v_count := cardinality(v_item.parts) = 0;
      v_title := v_item.name || case when v_qty > 1 then ' × ' || v_qty else '' end;
      update public.goods_stock set qty = qty - v_qty, updated_at = now()
       where item_id = v_item.id and branch_id = p_from_branch
         and at_workshop = coalesce(p_from_workshop, false);
      insert into public.goods_movements
        (item_id, branch_id, at_workshop, qty, kind, transfer_id, notes, created_by)
      values
        (v_item.id, p_from_branch, coalesce(p_from_workshop, false), -v_qty, 'send', v_transfer,
         'إرسال إلى فرع ' || v_to_name, auth.uid());
    end if;

    v_sent := array(select x from unnest(v_check) as x where x = any(v_sent));
    if cardinality(v_sent) = 0 then
      raise exception 'أشّر على القطع المرسلة من «%»', v_title;
    end if;

    insert into public.goods_transfer_lines
      (transfer_id, item_id, order_id, qty, title, checklist, sent, position, is_count, units)
    values
      (v_transfer, v_item.id, v_order.id, v_qty, v_title, v_check, v_sent, v_pos, v_count, v_units)
    returning id into v_line_id;

    if cardinality(private.text_minus(v_check, v_sent)) > 0 then
      insert into public.part_issues (stage, branch_id, transfer_line_id, order_id, title, missing, created_by)
      values ('send', p_to_branch, v_line_id, v_order.id, v_title, private.text_minus(v_check, v_sent), auth.uid());
    end if;

    v_item := null;
    v_order := null;
  end loop;

  return v_transfer;
end $$;

-- ===== 8) استلام شحنة (بالعدد للأصناف اللي تنعدّ) =====
-- p_lines: [{"line_id": uuid, "received": ["…"], "received_qty": 2}]
create or replace function public.receive_goods(p_transfer_id uuid, p_lines jsonb) returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  t public.goods_transfers;
  l public.goods_transfer_lines;
  v_in jsonb;
  v_got text[];
  v_got_qty integer;
  v_missing text[];
  v_name text;
  v_from text;
begin
  if not private.can(auth.uid(), 'goods.transfer') then
    raise exception 'غير مصرح';
  end if;
  select * into t from public.goods_transfers where id = p_transfer_id for update;
  if t.id is null then
    raise exception 'الشحنة غير موجودة';
  end if;
  if t.status <> 'in_transit' then
    raise exception 'الشحنة مستلمة مسبقًا';
  end if;
  if not private.branch_ok(auth.uid(), t.to_branch_id) then
    raise exception 'غير مصرح لهذا الفرع';
  end if;
  v_from := case when t.from_workshop then 'المعمل'
                 else 'فرع ' || (select name from public.branches where id = t.from_branch_id) end;

  for l in select * from public.goods_transfer_lines where transfer_id = t.id order by position loop
    select x into v_in
      from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) as x
     where (x->>'line_id')::uuid = l.id
     limit 1;

    if l.is_count then
      -- صنف ينعدّ: العدد اللي وصل
      v_got_qty := least(greatest(coalesce((v_in->>'received_qty')::integer,
                     case when l.checklist[1] = any(coalesce(array(select jsonb_array_elements_text(v_in->'received')), '{}'))
                          then l.qty else 0 end), 0), l.qty);
      v_got := case when v_got_qty > 0 then l.sent else '{}' end;
      select name into v_name from public.goods_items where id = l.item_id;
      v_missing := case when v_got_qty < l.qty
                        then array[coalesce(v_name, l.title) || ' × ' || (l.qty - v_got_qty)] else '{}' end;
    else
      v_got := coalesce(array(select jsonb_array_elements_text(v_in->'received')), '{}');
      v_got := array(select s from unnest(l.sent) as s where s = any(v_got));
      v_missing := private.text_minus(l.sent, v_got);
      v_got_qty := case
        when l.units is not null then cardinality(array(select u from unnest(l.units) as u where u = any(v_got)))
        when l.checklist[1] = any(v_got) then l.qty
        else 0 end;
    end if;

    update public.goods_transfer_lines set received = v_got, received_qty = v_got_qty where id = l.id;

    if l.item_id is not null and l.followup_issue_id is null then
      if v_got_qty > 0 then
        insert into public.goods_stock (item_id, branch_id, at_workshop, qty)
        values (l.item_id, t.to_branch_id, false, v_got_qty)
        on conflict (item_id, branch_id, at_workshop)
        do update set qty = public.goods_stock.qty + excluded.qty, updated_at = now();
        insert into public.goods_movements
          (item_id, branch_id, at_workshop, qty, kind, transfer_id, notes, created_by)
        values
          (l.item_id, t.to_branch_id, false, v_got_qty, 'receive', t.id, 'استلام من ' || v_from, auth.uid());
      end if;
    elsif l.order_id is not null and l.followup_issue_id is null then
      update public.orders set dress_location = 'branch'
       where id = l.order_id and dress_location = 'transit';
      perform private.log_activity(l.order_id, null, 'dress_received',
        'استلم الفرع: ' || coalesce(nullif(array_to_string(v_got, '، '), ''), 'لا شيء'));
    elsif l.order_id is not null then
      perform private.log_activity(l.order_id, null, 'dress_received',
        'استلم الفرع القطع الناقصة: ' || coalesce(nullif(array_to_string(v_got, '، '), ''), 'لا شيء'));
    end if;

    if cardinality(v_missing) > 0 then
      insert into public.part_issues (stage, branch_id, transfer_line_id, order_id, title, missing, created_by)
      values ('receive', t.to_branch_id, l.id, l.order_id, l.title, v_missing, auth.uid());
    end if;
  end loop;

  update public.goods_transfers
     set status = 'received', received_by = auth.uid(), received_at = now()
   where id = t.id;
end $$;

-- ===== 9) إرسال القطع الناقصة لاحقًا =====
create or replace function public.send_missing_parts(p_issue_id uuid, p_notes text default null) returns uuid
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  i public.part_issues;
  l public.goods_transfer_lines;
  t public.goods_transfers;
  v_transfer uuid;
  v_no text;
begin
  if not private.can(auth.uid(), 'goods.transfer') then
    raise exception 'غير مصرح';
  end if;
  select * into i from public.part_issues where id = p_issue_id for update;
  if i.id is null or i.resolved_at is not null then
    raise exception 'النقص غير موجود أو تمت متابعته';
  end if;
  if i.stage <> 'send' or i.transfer_line_id is null then
    raise exception 'هذا النقص ما يتابَع بشحنة';
  end if;
  select * into l from public.goods_transfer_lines where id = i.transfer_line_id;
  select * into t from public.goods_transfers where id = l.transfer_id;
  if (t.from_workshop and not private.workshop_ok(auth.uid()))
     or (not t.from_workshop and not private.branch_ok(auth.uid(), t.from_branch_id)) then
    raise exception 'الإرسال من هذا الموقع لموظفيه';
  end if;

  v_no := 'T-' || lpad(nextval('public.goods_transfer_seq')::text, 5, '0');
  insert into public.goods_transfers
    (transfer_no, from_branch_id, from_workshop, to_branch_id, notes, sent_by)
  values
    (v_no, t.from_branch_id, t.from_workshop, t.to_branch_id,
     coalesce(nullif(btrim(coalesce(p_notes, '')), ''), 'القطع الناقصة من الشحنة ' || t.transfer_no),
     auth.uid())
  returning id into v_transfer;

  insert into public.goods_transfer_lines
    (transfer_id, item_id, order_id, qty, title, checklist, sent, position, followup_issue_id)
  values
    (v_transfer, l.item_id, l.order_id, 1, l.title || ' — القطع الناقصة', i.missing, i.missing, 1, i.id);

  update public.part_issues
     set resolved_at = now(), resolved_by = auth.uid(), resolution = 'أُرسلت في الشحنة ' || v_no
   where id = i.id;

  if l.order_id is not null then
    perform private.log_activity(l.order_id, null, 'dress_sent',
      'أُرسلت القطع الناقصة: ' || array_to_string(i.missing, '، '));
  end if;
  return v_transfer;
end $$;

revoke all on function public.send_missing_parts(uuid, text) from public, anon;
grant execute on function public.send_missing_parts(uuid, text) to authenticated;

-- ===== 10) ما يُسلَّم الطلب وفستانه للحين في المعمل أو الطريق =====
create or replace function private.guard_order_delivery() returns trigger
    language plpgsql
    set search_path to 'public'
    as $$
begin
  if new.state = 'delivered' and old.state <> 'delivered'
     and old.dress_location in ('workshop', 'transit') then
    raise exception 'الفستان للحين % — أرسله من المعمل وأكّد استلامه في الفرع قبل التسليم',
      case old.dress_location when 'workshop' then 'في المعمل' else 'في الطريق للفرع' end;
  end if;
  return new;
end $$;

revoke all on function private.guard_order_delivery() from public;
grant execute on function private.guard_order_delivery() to authenticated;

drop trigger if exists orders_zz_delivery_guard on public.orders;
create trigger orders_zz_delivery_guard before update of state on public.orders
  for each row execute function private.guard_order_delivery();

-- إنهاء مرحلة «التسليم» نفسها (قبل تغيير حالة الطلب)
create or replace function private.guard_delivery_stage() returns trigger
    language plpgsql
    set search_path to 'public'
    as $$
declare v_loc text;
begin
  if new.stage::text = 'delivery' and new.status::text in ('done', 'review')
     and old.status::text not in ('done', 'review') then
    select dress_location into v_loc from public.orders where id = new.order_id;
    if v_loc in ('workshop', 'transit') then
      raise exception 'الفستان للحين % — أرسله من المعمل وأكّد استلامه في الفرع قبل التسليم',
        case v_loc when 'workshop' then 'في المعمل' else 'في الطريق للفرع' end;
    end if;
  end if;
  return new;
end $$;

revoke all on function private.guard_delivery_stage() from public;
grant execute on function private.guard_delivery_stage() to authenticated;

drop trigger if exists order_stages_delivery_guard on public.order_stages;
create trigger order_stages_delivery_guard before update of status on public.order_stages
  for each row execute function private.guard_delivery_stage();

-- ===== 11) البيع: الخصم بصلاحية =====
create or replace function public.sell_goods(
  p_branch_id uuid,
  p_client_name text,
  p_client_phone text,
  p_method public.payment_method,
  p_lines jsonb,
  p_notes text default null
) returns uuid
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_invoice uuid;
  v_no text;
  v_line jsonb;
  v_pos integer := 0;
  v_item public.goods_items;
  v_qty integer;
  v_price numeric;
  v_have integer;
  v_vat_on boolean;
  v_rate numeric;
  v_total numeric;
  v_discount boolean := private.can(auth.uid(), 'goods.discount');
begin
  if not private.can(auth.uid(), 'goods.sell') then
    raise exception 'غير مصرح';
  end if;
  if not private.branch_ok(auth.uid(), p_branch_id)
     or exists (select 1 from public.branches where id = p_branch_id and is_warehouse) then
    raise exception 'اختر فرع البيع';
  end if;
  if coalesce(btrim(p_client_name), '') = '' then
    raise exception 'اكتب اسم العميلة';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'أضف قطعة للبيع';
  end if;

  select vat_enabled, vat_rate into v_vat_on, v_rate
    from public.tax_settings
   order by (branch_id is not distinct from p_branch_id) desc, (branch_id is null) desc
   limit 1;
  v_vat_on := coalesce(v_vat_on, true);
  v_rate := case when v_vat_on then coalesce(v_rate, 15) else 0 end;

  insert into public.invoices
    (scope, status, is_taxable, vat_rate, branch_id, client_name, client_phone, notes, created_by)
  values
    ('sale', 'draft', v_vat_on, v_rate, p_branch_id, btrim(p_client_name),
     nullif(btrim(coalesce(p_client_phone, '')), ''), nullif(btrim(coalesce(p_notes, '')), ''), auth.uid())
  returning id, invoice_no into v_invoice, v_no;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_pos := v_pos + 1;
    select * into v_item from public.goods_items where id = (v_line->>'item_id')::uuid;
    if v_item.id is null or not v_item.is_active then
      raise exception 'الصنف غير موجود';
    end if;
    if not v_item.sellable then
      raise exception '«%» غير قابل للبيع', v_item.name;
    end if;
    v_qty := coalesce((v_line->>'qty')::integer, 1);
    v_price := coalesce((v_line->>'price')::numeric, v_item.price);
    if v_qty <= 0 or v_price < 0 then
      raise exception 'تأكد من الكمية والسعر لـ «%»', v_item.name;
    end if;
    if v_price < v_item.price and not v_discount then
      raise exception 'سعر «%» أقل من السعر المفترض — البيع بخصم يحتاج صلاحية', v_item.name;
    end if;

    select qty into v_have from public.goods_stock
     where item_id = v_item.id and branch_id = p_branch_id and not at_workshop
     for update;
    if coalesce(v_have, 0) < v_qty then
      raise exception 'المتوفر من «%» في الفرع % فقط', v_item.name, coalesce(v_have, 0);
    end if;

    insert into public.invoice_lines
      (invoice_id, description, qty, unit_price, unit_price_incl, list_price, goods_item_id, position)
    values
      (v_invoice, v_item.name || ' (' || v_item.code || ')', v_qty,
       round(v_price * 100 / (100 + v_rate), 2), round(v_price, 2), v_item.price, v_item.id, v_pos);

    update public.goods_stock set qty = qty - v_qty, updated_at = now()
     where item_id = v_item.id and branch_id = p_branch_id and not at_workshop;
    insert into public.goods_movements
      (item_id, branch_id, at_workshop, qty, kind, invoice_id, notes, created_by)
    values
      (v_item.id, p_branch_id, false, -v_qty, 'sale', v_invoice, 'بيع — فاتورة ' || v_no, auth.uid());
  end loop;

  update public.invoices set status = 'issued' where id = v_invoice;

  select total into v_total from public.invoices where id = v_invoice;
  if v_total > 0 then
    insert into public.payments
      (scope, invoice_id, amount, method, paid_at, notes, cash_account_id, branch_id, created_by)
    values
      ('sale', v_invoice, v_total, coalesce(p_method, 'cash'), current_date,
       'بيع — فاتورة ' || v_no || ' — ' || btrim(p_client_name),
       private.method_box(p_branch_id, coalesce(p_method, 'cash')), p_branch_id, auth.uid());
  end if;

  return v_invoice;
end $$;

-- ===== 12) مرتجع البيع =====
alter table public.invoice_lines
  add column if not exists returned_qty numeric(12,2) not null default 0;

alter table public.cash_vouchers drop constraint if exists cash_vouchers_kind_check;
alter table public.cash_vouchers add constraint cash_vouchers_kind_check
  check (kind in ('deposit_refund', 'cancel_refund', 'sale_refund'));
alter table public.cash_vouchers
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null;

create sequence if not exists public.sale_return_seq;

create table if not exists public.sale_returns (
  id uuid primary key default gen_random_uuid(),
  return_no text not null unique,
  invoice_id uuid not null references public.invoices(id),
  branch_id uuid references public.branches(id),
  total numeric(12,2) not null default 0,
  net numeric(12,2) not null default 0,
  vat numeric(12,2) not null default 0,
  method public.payment_method not null default 'cash',
  cash_account_id uuid references public.cash_accounts(id),
  voucher_no text,
  reason text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.sale_return_lines (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.sale_returns(id) on delete cascade,
  invoice_line_id uuid not null references public.invoice_lines(id),
  goods_item_id uuid references public.goods_items(id),
  qty integer not null check (qty > 0),
  unit_price_incl numeric(12,2) not null default 0
);

create index if not exists sale_returns_invoice_idx on public.sale_returns(invoice_id);

grant select on public.sale_returns to authenticated;
grant select on public.sale_return_lines to authenticated;
grant all on public.sale_returns to service_role;
grant all on public.sale_return_lines to service_role;
alter table public.sale_returns enable row level security;
alter table public.sale_return_lines enable row level security;

drop policy if exists "sale returns readable" on public.sale_returns;
create policy "sale returns readable" on public.sale_returns
for select to authenticated
using (
  (private.can(auth.uid(), 'goods.sell') or private.can(auth.uid(), 'goods.return')
   or private.can(auth.uid(), 'finance.invoices') or private.can(auth.uid(), 'finance.payments'))
  and private.branch_ok(auth.uid(), branch_id)
);

drop policy if exists "sale return lines readable" on public.sale_return_lines;
create policy "sale return lines readable" on public.sale_return_lines
for select to authenticated
using (exists (
  select 1 from public.sale_returns r
   where r.id = return_id
     and (private.can(auth.uid(), 'goods.sell') or private.can(auth.uid(), 'goods.return')
          or private.can(auth.uid(), 'finance.invoices') or private.can(auth.uid(), 'finance.payments'))
     and private.branch_ok(auth.uid(), r.branch_id)
));

-- p_lines: [{"line_id": uuid, "qty": 1}]
create or replace function public.return_sale(
  p_invoice_id uuid,
  p_lines jsonb,
  p_method public.payment_method,
  p_reason text
) returns uuid
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  inv public.invoices;
  il public.invoice_lines;
  v_line jsonb;
  v_qty integer;
  v_return uuid;
  v_no text;
  v_total numeric := 0;
  v_net numeric;
  v_vat numeric;
  v_box uuid;
  v_voucher text;
  v_lines jsonb;
  v_entry uuid;
begin
  if not private.can(auth.uid(), 'goods.return') then
    raise exception 'غير مصرح';
  end if;
  select * into inv from public.invoices where id = p_invoice_id for update;
  if inv.id is null or inv.scope::text <> 'sale' then
    raise exception 'فاتورة البيع غير موجودة';
  end if;
  if inv.status::text <> 'issued' then
    raise exception 'الفاتورة غير صادرة';
  end if;
  if not private.branch_ok(auth.uid(), inv.branch_id) then
    raise exception 'غير مصرح لهذا الفرع';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'اكتب سبب المرتجع';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'اختر القطع المرتجعة';
  end if;

  v_no := 'SR-' || lpad(nextval('public.sale_return_seq')::text, 5, '0');
  insert into public.sale_returns (return_no, invoice_id, branch_id, method, reason, created_by)
  values (v_no, inv.id, inv.branch_id, coalesce(p_method, 'cash'), btrim(p_reason), auth.uid())
  returning id into v_return;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := coalesce((v_line->>'qty')::integer, 0);
    if v_qty <= 0 then
      continue;
    end if;
    select * into il from public.invoice_lines
     where id = (v_line->>'line_id')::uuid and invoice_id = inv.id
     for update;
    if il.id is null then
      raise exception 'سطر غير موجود في الفاتورة';
    end if;
    if v_qty > il.qty - il.returned_qty then
      raise exception 'المرتجع من «%» أكثر من المباع', il.description;
    end if;

    insert into public.sale_return_lines (return_id, invoice_line_id, goods_item_id, qty, unit_price_incl)
    values (v_return, il.id, il.goods_item_id, v_qty, coalesce(il.unit_price_incl, il.unit_price));
    update public.invoice_lines set returned_qty = returned_qty + v_qty where id = il.id;
    v_total := v_total + v_qty * coalesce(il.unit_price_incl, il.unit_price);

    if il.goods_item_id is not null then
      insert into public.goods_stock (item_id, branch_id, at_workshop, qty)
      values (il.goods_item_id, inv.branch_id, false, v_qty)
      on conflict (item_id, branch_id, at_workshop)
      do update set qty = public.goods_stock.qty + excluded.qty, updated_at = now();
      insert into public.goods_movements
        (item_id, branch_id, at_workshop, qty, kind, invoice_id, notes, created_by)
      values
        (il.goods_item_id, inv.branch_id, false, v_qty, 'return', inv.id,
         'مرتجع ' || v_no || ' — فاتورة ' || inv.invoice_no, auth.uid());
    end if;
  end loop;

  v_total := round(v_total, 2);
  if v_total <= 0 then
    raise exception 'اختر القطع المرتجعة';
  end if;
  v_net := case when inv.is_taxable then round(v_total * 100 / (100 + coalesce(inv.vat_rate, 0)), 2) else v_total end;
  v_vat := v_total - v_net;

  -- سند صرف من صندوق الفرع حسب طريقة الرد
  v_box := private.method_box(inv.branch_id, coalesce(p_method, 'cash'));
  v_voucher := private.issue_voucher('sale_refund', null, v_total, coalesce(p_method, 'cash'), v_box,
    inv.branch_id, 'مرتجع ' || v_no || ' — فاتورة ' || inv.invoice_no || ' — ' || coalesce(inv.client_name, ''),
    auth.uid());
  update public.cash_vouchers set invoice_id = inv.id where voucher_no = v_voucher;

  -- القيد: عكس الإيراد والضريبة مقابل الصندوق
  v_lines := jsonb_build_array(
    jsonb_build_object('code', '4310', 'debit', v_net, 'credit', 0, 'memo', 'مرتجع بيع'),
    jsonb_build_object('code', private.box_gl(v_box), 'debit', 0, 'credit', v_total)
  );
  if v_vat > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('code', '2210', 'debit', v_vat, 'credit', 0, 'memo', 'ضريبة المرتجع'));
  end if;
  v_entry := private.post_entry(current_date, 'مرتجع بيع ' || v_no || ' — فاتورة ' || inv.invoice_no,
    'sale_return', v_return, v_lines, auth.uid());
  perform private.post_entry_branch(v_entry, inv.branch_id);

  update public.sale_returns
     set total = v_total, net = v_net, vat = v_vat, cash_account_id = v_box, voucher_no = v_voucher
   where id = v_return;

  return v_return;
end $$;

revoke all on function public.return_sale(uuid, jsonb, public.payment_method, text) from public, anon;
grant execute on function public.return_sale(uuid, jsonb, public.payment_method, text) to authenticated;

-- فاتورة البيع ما تنلغى من الماليات (المرتجع يرجّع القطع والمبلغ)
create or replace function private.guard_sale_invoice_cancel() returns trigger
    language plpgsql
    set search_path to 'public'
    as $$
begin
  if new.scope::text = 'sale' and old.status::text = 'issued' and new.status::text <> 'issued' then
    raise exception 'فاتورة البيع ما تنلغى — سوّ مرتجع من صفحة الفاتورة في المخزون';
  end if;
  return new;
end $$;

revoke all on function private.guard_sale_invoice_cancel() from public;
grant execute on function private.guard_sale_invoice_cancel() to authenticated;

drop trigger if exists invoices_guard_sale_cancel on public.invoices;
create trigger invoices_guard_sale_cancel before update of status on public.invoices
  for each row execute function private.guard_sale_invoice_cancel();

-- ===== 13) صلاحيات افتراضية (تُضاف فقط) =====
insert into public.role_permissions (role_id, permission)
select r.id, p.perm
  from public.roles r
  join (values
    ('supervisor','goods.discount'),('supervisor','goods.return'),
    ('cs','goods.discount')
  ) as p(role_key, perm) on p.role_key = r.key
on conflict (role_id, permission) do nothing;

-- ===== 14) قطع فستان الإيجار عند الخروج والرجوع =====
alter table public.rental_dresses
  add column if not exists parts text[] not null default '{}';

alter table public.rental_records
  add column if not exists out_parts text[],
  add column if not exists return_parts text[];

alter table public.part_issues
  add column if not exists rental_record_id uuid references public.rental_records(id) on delete cascade;

alter table public.part_issues drop constraint if exists part_issues_stage_check;
alter table public.part_issues add constraint part_issues_stage_check
  check (stage in ('send', 'receive', 'deliver', 'rental_out', 'rental_return'));

-- يُستدعى بعد تسليم الفستان أو إرجاعه: يحفظ القطع المؤشّرة ويسجّل الناقص للمتابعة
create or replace function public.record_rental_parts(p_record_id uuid, p_stage text, p_parts text[])
returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  r public.rental_records;
  d public.rental_dresses;
  v_check text[];
  v_given text[];
begin
  if not private.can(auth.uid(), 'rentals.manage') then
    raise exception 'غير مصرح';
  end if;
  if p_stage not in ('out', 'return') then
    raise exception 'مرحلة غير معروفة';
  end if;
  select * into r from public.rental_records where id = p_record_id for update;
  if r.id is null then
    raise exception 'العقد غير موجود';
  end if;
  if not private.branch_ok(auth.uid(), r.branch_id) then
    raise exception 'غير مصرح لهذا الفرع';
  end if;
  select * into d from public.rental_dresses where id = r.dress_id;

  -- اللي يرجع هو اللي خرج
  v_check := case when p_stage = 'return' and r.out_parts is not null
                  then r.out_parts else private.parts_or_dress(d.parts) end;
  v_given := array(select x from unnest(v_check) as x where x = any(coalesce(p_parts, '{}')));

  if p_stage = 'out' then
    update public.rental_records set out_parts = v_given where id = r.id;
  else
    update public.rental_records set return_parts = v_given where id = r.id;
  end if;

  if cardinality(private.text_minus(v_check, v_given)) > 0 then
    insert into public.part_issues (stage, branch_id, rental_record_id, order_id, title, missing, created_by)
    values (case when p_stage = 'out' then 'rental_out' else 'rental_return' end,
            r.branch_id, r.id, r.order_id,
            'فستان إيجار ' || coalesce(d.code, '') || ' — ' || r.client_name,
            private.text_minus(v_check, v_given), auth.uid());
  end if;
end $$;

revoke all on function public.record_rental_parts(uuid, text, text[]) from public, anon;
grant execute on function public.record_rental_parts(uuid, text, text[]) to authenticated;
