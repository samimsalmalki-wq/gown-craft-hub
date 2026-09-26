-- مرحلة «التسليم للمحل» تُحدَّد من إعداد المراحل (بدل الاعتماد على مفتاح delivery)
--  • stage_templates.sends_to_branch: لما يوصل الطلب لهذي المرحلة يدخل «جاهز المعمل» لفرعه.
--    بدون مرحلة محددة: آخر مرحلة مطلوبة في الطلب.
--  • استلام الفرع للفستان يُنهي مرحلة التسليم للمحل وينقل الطلب للمرحلة اللي بعدها.
--  • التسليم للعميلة = آخر مرحلة مطلوبة في الطلب (أيًّا كان اسمها)، وما تخلص والفستان في المعمل أو الطريق.
-- كل الخطوات آمنة لو انعاد تشغيل الملف. يحجز الجداول أول شي عشان ما يتعارض مع الموقع الشغال.

begin;

set local lock_timeout = '20s';
lock table public.stage_templates, public.orders, public.order_stages in access exclusive mode;

alter table public.stage_templates
  add column if not exists sends_to_branch boolean not null default false;

-- التحديد الأول: آخر مرحلة مفعّلة اسمها فيه «التسليم للمحل»، وإلا مرحلة delivery المفعّلة
do $$
begin
  if not exists (select 1 from public.stage_templates where sends_to_branch) then
    update public.stage_templates set sends_to_branch = true
     where id = coalesce(
       (select id from public.stage_templates
         where is_active and label like '%التسليم للمحل%' order by position desc limit 1),
       (select id from public.stage_templates where is_active and stage = 'delivery' limit 1));
  end if;
end $$;

-- آخر مرحلة مطلوبة في الطلب (التسليم للعميلة)
create or replace function private.last_required_stage(_order uuid) returns text
    language sql stable security definer
    set search_path to 'public'
    as $$
  select stage::text from public.order_stages
   where order_id = _order and is_required
   order by position desc limit 1
$$;

-- هل وصول الطلب لهذي المرحلة يعني إن الفستان جاهز في المعمل للإرسال؟
create or replace function private.is_handover_stage(_order uuid, _stage text) returns boolean
    language sql stable security definer
    set search_path to 'public'
    as $$
  select case
    when exists (select 1 from public.stage_templates where sends_to_branch and is_active)
      then exists (select 1 from public.stage_templates
                    where stage::text = _stage and sends_to_branch and is_active)
    else _stage = private.last_required_stage(_order)
  end
$$;

revoke all on function private.last_required_stage(uuid) from public;
revoke all on function private.is_handover_stage(uuid, text) from public;
grant execute on function private.last_required_stage(uuid) to authenticated, service_role;
grant execute on function private.is_handover_stage(uuid, text) to authenticated, service_role;

-- مكان الفستان حسب مرحلة الطلب
create or replace function private.track_dress_location() returns trigger
    language plpgsql
    set search_path to 'public'
    as $$
begin
  if new.state = 'delivered' then
    new.dress_location := 'delivered';
  elsif new.state = 'active' and old.state = 'delivered' then
    new.dress_location := 'branch';
  elsif new.state = 'active'
        and new.current_stage::text is distinct from old.current_stage::text
        and new.dress_location in ('production', 'branch')
        and private.is_handover_stage(new.id, new.current_stage::text) then
    new.dress_location := 'workshop';
  end if;
  return new;
end $$;

-- الطلبات الجارية اللي تعدّت مرحلة التسليم للمحل: الفستان في الفرع
update public.orders o
   set dress_location = 'branch'
 where o.state = 'active'
   and o.dress_location = 'production'
   and exists (select 1 from public.stage_templates h where h.sends_to_branch and h.is_active)
   and (select t.position from public.stage_templates t where t.stage::text = o.current_stage::text limit 1)
     > (select min(h.position) from public.stage_templates h where h.sends_to_branch and h.is_active);

-- والطلبات الواقفة على مرحلة التسليم للمحل: جاهزة في المعمل
update public.orders o
   set dress_location = 'workshop'
 where o.state = 'active'
   and o.dress_location = 'production'
   and private.is_handover_stage(o.id, o.current_stage::text);

-- إنهاء مرحلة التسليم للعميلة (آخر مرحلة) والفستان للحين في المعمل أو الطريق
create or replace function private.guard_delivery_stage() returns trigger
    language plpgsql
    set search_path to 'public'
    as $$
declare v_loc text;
begin
  if new.status::text in ('done', 'review') and old.status::text not in ('done', 'review')
     and new.stage::text = private.last_required_stage(new.order_id) then
    select dress_location into v_loc from public.orders where id = new.order_id;
    if v_loc in ('workshop', 'transit') then
      raise exception 'الفستان للحين % — أرسله من المعمل وأكّد استلامه في الفرع قبل التسليم',
        case v_loc when 'workshop' then 'في المعمل' else 'في الطريق للفرع' end;
    end if;
  end if;
  return new;
end $$;

-- التسليم للعميلة بقائمة القطع: يُنهي آخر مرحلة مطلوبة
create or replace function public.deliver_order_parts(p_order_id uuid, p_parts text[]) returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  o public.orders;
  v_check text[];
  v_given text[];
  v_last text;
begin
  if not (private.can(auth.uid(), 'orders.edit') or private.can(auth.uid(), 'goods.transfer')
          or private.can(auth.uid(), 'stages.manage')) then
    raise exception 'غير مصرح';
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then
    raise exception 'الطلب غير موجود';
  end if;
  if not private.branch_ok(auth.uid(), o.branch_id) then
    raise exception 'غير مصرح لهذا الفرع';
  end if;
  if o.state <> 'active' then
    raise exception 'الطلب مسلَّم أو ملغي';
  end if;
  if o.order_kind <> 'own' then
    raise exception 'طلبات الإيجار تُسلَّم من صفحة الطلب';
  end if;

  v_check := private.parts_or_dress(o.parts);
  v_given := array(select x from unnest(v_check) as x where x = any(coalesce(p_parts, '{}')));
  if cardinality(v_given) = 0 then
    raise exception 'أشّر على القطع المسلَّمة';
  end if;

  v_last := coalesce(private.last_required_stage(o.id), o.current_stage::text);

  update public.order_stages
     set status = 'done',
         started_at = coalesce(started_at, now()),
         completed_at = coalesce(completed_at, now()),
         review_status = 'approved'
   where order_id = o.id and stage::text = v_last and status::text <> 'done';

  update public.orders
     set current_stage = v_last, state = 'delivered', delivered_parts = v_given
   where id = o.id;

  perform private.log_activity(o.id, null, 'dress_delivered',
    'سُلّم للعميلة: ' || array_to_string(v_given, '، '));

  if cardinality(private.text_minus(v_check, v_given)) > 0 then
    insert into public.part_issues (stage, branch_id, order_id, title, missing, created_by)
    values ('deliver', o.branch_id, o.id, 'طلب ' || o.order_no || ' — ' || o.client_name,
            private.text_minus(v_check, v_given), auth.uid());
  end if;
end $$;

-- استلام الفرع للفستان يُنهي مرحلة التسليم للمحل وينقل الطلب للمرحلة اللي بعدها
create or replace function private.complete_handover_on_receive() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_stage text;
  v_pos integer;
  v_next text;
begin
  if not (new.dress_location = 'branch' and old.dress_location = 'transit' and new.state = 'active') then
    return new;
  end if;
  v_stage := new.current_stage::text;
  if not private.is_handover_stage(new.id, v_stage) then
    return new;
  end if;

  update public.order_stages
     set status = 'done',
         started_at = coalesce(started_at, now()),
         completed_at = coalesce(completed_at, now()),
         review_status = 'approved'
   where order_id = new.id and stage::text = v_stage and status::text <> 'done'
  returning position into v_pos;

  if v_pos is null then
    select position into v_pos from public.order_stages where order_id = new.id and stage::text = v_stage;
  end if;
  select stage::text into v_next from public.order_stages
   where order_id = new.id and is_required and position > coalesce(v_pos, 0)
   order by position limit 1;

  if v_next is not null then
    update public.orders set current_stage = v_next where id = new.id;
  end if;
  return new;
end $$;

revoke all on function private.complete_handover_on_receive() from public;

drop trigger if exists orders_complete_handover on public.orders;
create trigger orders_complete_handover after update of dress_location on public.orders
  for each row execute function private.complete_handover_on_receive();

commit;
