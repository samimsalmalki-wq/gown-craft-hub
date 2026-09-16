-- 1) حد أدنى لكل موقع: نسخ الحد من المادة للمواقع التي لم تُحدَّد
update public.material_stock s
   set min_qty = m.min_qty
  from public.materials m
 where m.id = s.material_id
   and s.min_qty = 0
   and m.min_qty > 0;

-- 2) منع الحجز أو الصرف بأكثر من المتاح في الموقع + توريث الحد الأدنى للصف الجديد
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
  v_available numeric;
begin
  select name, unit, min_qty into v_name, v_unit, v_min
    from public.materials where id = new.material_id;
  v_branch := coalesce(new.branch_id, (select id from public.branches where is_main limit 1));

  insert into public.material_stock (material_id, branch_id, min_qty)
  values (new.material_id, v_branch, coalesce(v_min, 0))
  on conflict (material_id, branch_id) do nothing;

  if new.kind in ('reserve','out') then
    select qty_on_hand - qty_reserved into v_available
      from public.material_stock
     where material_id = new.material_id and branch_id = v_branch
     for update;

    if new.kind = 'out' then
      -- الصرف يستهلك الحجز القائم لنفس الكمية، فالمقارنة على الموجود فعلًا
      select qty_on_hand into v_available
        from public.material_stock
       where material_id = new.material_id and branch_id = v_branch;
    end if;

    if coalesce(v_available, 0) < new.qty then
      raise exception 'الكمية المطلوبة (%) أكبر من المتاح في هذا الموقع (%) من %',
        new.qty::text, coalesce(v_available,0)::text, coalesce(v_name,'المادة')
        using errcode = 'check_violation';
    end if;
  end if;

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
      coalesce(v_name,'مادة') || ' — ' || new.qty::text || ' ' || coalesce(v_unit,''));
  end if;
  return new;
end $function$;