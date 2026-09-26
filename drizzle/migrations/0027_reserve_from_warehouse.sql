-- حجز خامات الطلبات من المخزن الرئيسي مباشرة (يُشغَّل بعد 0025)
--  • الحجز الجديد لأي طلب يكون في المخزن الرئيسي، بدون الفرع وبدون طلبات صرف،
--    والصرف على الطلب يكون من نفس مكان حجزه.
--  • الحجوزات المفتوحة الحالية في الفروع تنتقل للمخزن الرئيسي إذا كميته تكفي
--    (بحركة «تحرير» في الفرع و«حجز» في المخزن، وتظهر في سجل حركات المادة).

-- المخزن الرئيسي (إن وُجد)
create or replace function private.warehouse_id() returns uuid
    language sql stable security definer
    set search_path to 'public'
    as $$
  select id from public.branches where is_warehouse and is_active order by position limit 1
$$;

revoke all on function private.warehouse_id() from public;
grant execute on function private.warehouse_id() to authenticated, service_role;

-- موقع الحجز: مكان حجز السطر لو فيه حجز قائم، وإلا المخزن الرئيسي، وإلا فرع الطلب
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
  v_branch := case
    when r.id is not null and r.qty_reserved > 0 and r.branch_id is not null then r.branch_id
    else coalesce(private.warehouse_id(), o.branch_id, (select id from public.branches where is_main limit 1))
  end;

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

-- نقل الحجوزات المفتوحة من الفروع للمخزن الرئيسي
do $$
declare
  r record;
  v_wh uuid := private.warehouse_id();
  v_avail numeric;
begin
  if v_wh is null then
    return;
  end if;
  for r in
    select om.id, om.order_id, om.material_id, om.qty_reserved, om.branch_id
      from public.order_materials om
      join public.orders o on o.id = om.order_id
     where o.state = 'active'
       and om.qty_reserved > 0
       and om.branch_id is distinct from v_wh
     order by o.created_at
  loop
    select qty_on_hand - qty_reserved into v_avail
      from public.material_stock
     where material_id = r.material_id and branch_id = v_wh;
    if coalesce(v_avail, 0) >= r.qty_reserved then
      insert into public.material_movements (material_id, order_id, kind, qty, notes, branch_id)
      values (r.material_id, r.order_id, 'release', r.qty_reserved, 'نقل الحجز للمخزن الرئيسي', r.branch_id);
      insert into public.material_movements (material_id, order_id, kind, qty, notes, branch_id)
      values (r.material_id, r.order_id, 'reserve', r.qty_reserved, 'حجز من المخزن الرئيسي', v_wh);
      update public.order_materials set branch_id = v_wh where id = r.id;
    end if;
  end loop;
end $$;
