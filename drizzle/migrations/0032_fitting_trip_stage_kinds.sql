-- مراحل كل نوع طلب، ورحلة قطعة البروفة الأولى (المعمل ← الفرع ← المعمل)
--  • stage_templates.order_kinds: أنواع الطلبات اللي تنطبق عليها المرحلة. الطلب الجديد يتخطى
--    المراحل اللي ما تنطبق على نوعه (تنضاف له «غير مطلوبة»). الإيجار ما فيه بروفة مقاسات أولى.
--  • stage_templates.sends_for_fitting: «إرسال للبروفة». لما يوصل الطلب لهذي المرحلة تطلع القطعة
--    في المعمل، وتنرسل للفرع، واستلام الفرع يُنهي المرحلة. القطعة تبقى في الفرع «للبروفة»
--    لين يسجّل المشرف نتيجة البروفة والتعديلات ويرجّعها للمعمل (return_from_fitting).
--  • stage_templates.is_fitting: «مرحلة بروفة» لعدّاد «تنتظر بروفة» في لوحة التحكم.
--  • order_fittings: نتيجة كل بروفة (معتمدة أو إعادة) والتعديلات وتهميش المشرف.
--  • goods_transfers.to_workshop: شحنة راجعة من الفرع للمعمل.
-- آمن لو انعاد تشغيله. يحجز الجداول أول شي عشان ما يتعارض مع الموقع الشغال.

begin;

set local lock_timeout = '20s';
lock table public.stage_templates, public.orders, public.order_stages,
           public.goods_transfers, public.goods_transfer_lines, public.part_issues
  in access exclusive mode;

-- ===== 1) إعداد المراحل =====
alter table public.stage_templates
  add column if not exists order_kinds public.order_kind[] not null
    default array['own', 'rental', 'rental_stock']::public.order_kind[],
  add column if not exists sends_for_fitting boolean not null default false,
  add column if not exists is_fitting boolean not null default false;

alter table public.stage_templates drop constraint if exists stage_templates_kinds_check;
alter table public.stage_templates add constraint stage_templates_kinds_check
  check (cardinality(order_kinds) > 0);

alter table public.stage_templates drop constraint if exists stage_templates_trip_check;
alter table public.stage_templates add constraint stage_templates_trip_check
  check (not (sends_to_branch and sends_for_fitting));

-- التحديد الأول (مرة وحدة): البروفة الأولى وتشييكها واعتماد المقاسات للتفصيل الملك فقط،
-- والإرسال للبروفة على مرحلة التشييك على البروفة، و«مرحلة بروفة» على المراحل اللي اسمها يبدأ بـ«بروفة»
do $$
begin
  if not exists (select 1 from public.stage_templates
                  where cardinality(order_kinds) < 3) then
    update public.stage_templates
       set order_kinds = array['own']::public.order_kind[]
     where label like 'بروفة المقاسات%'
        or label like 'التشييك على البروفة%'
        or label like 'اعتماد المقاسات%';
  end if;

  if not exists (select 1 from public.stage_templates where sends_for_fitting) then
    update public.stage_templates set sends_for_fitting = true, sends_to_branch = false
     where id = (select id from public.stage_templates
                  where is_active and label like 'التشييك على البروفة%'
                  order by position limit 1);
  end if;

  if not exists (select 1 from public.stage_templates where is_fitting) then
    update public.stage_templates set is_fitting = true
     where is_active and label like 'بروفة%';
  end if;
end $$;

-- ===== 2) مراحل الطلب الجديد حسب نوعه =====
create or replace function public.create_default_stages()
    returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_first text;
begin
  select t.stage::text into v_first
    from public.stage_templates t
   where t.is_active and new.order_kind = any(t.order_kinds)
   order by t.position
   limit 1;

  insert into public.order_stages (order_id, stage, position, status, requires_review, is_required)
  select new.id, t.stage, t.position,
         case when t.stage::text = v_first then 'in_progress'::public.stage_status
              else 'pending'::public.stage_status end,
         t.requires_review,
         new.order_kind = any(t.order_kinds)
    from public.stage_templates t
   where t.is_active
   order by t.position;

  if v_first is not null and new.current_stage::text is distinct from v_first then
    update public.orders set current_stage = v_first where id = new.id;
  end if;
  return new;
end $$;

revoke all on function public.create_default_stages() from public, anon, authenticated;

-- الطلبات الجارية: المراحل اللي ما بدأت وما تنطبق على نوع الطلب تصير غير مطلوبة
update public.order_stages s
   set is_required = false
  from public.orders o, public.stage_templates t
 where o.id = s.order_id
   and t.stage::text = s.stage::text
   and o.state = 'active'
   and s.status = 'pending'
   and s.is_required
   and s.stage::text is distinct from o.current_stage::text
   and not (o.order_kind = any(t.order_kinds));

-- ===== 3) مكان الفستان: «في الفرع للبروفة» و«في الطريق للمعمل» =====
alter table public.orders drop constraint if exists orders_dress_location_check;
alter table public.orders add constraint orders_dress_location_check
  check (dress_location in
    ('production', 'workshop', 'transit', 'branch', 'fitting', 'returning', 'delivered'));

-- هل المرحلة «إرسال للبروفة» ومطلوبة في هذا الطلب؟
create or replace function private.is_fitting_trip_stage(_order uuid, _stage text) returns boolean
    language sql stable security definer
    set search_path to 'public'
    as $$
  select exists (
    select 1
      from public.stage_templates t
      join public.order_stages s on s.stage::text = t.stage::text and s.order_id = _order
     where t.stage::text = _stage and t.sends_for_fitting and t.is_active and s.is_required
  )
$$;

-- مكان القطعة لما توصل المعمل: جاهزة للإرسال لو الطلب واقف على مرحلة تسليم أو إرسال للبروفة
create or replace function private.workshop_location(_order uuid, _stage text) returns text
    language sql stable security definer
    set search_path to 'public'
    as $$
  select case
    when private.is_handover_stage(_order, _stage) or private.is_fitting_trip_stage(_order, _stage)
      then 'workshop'
    else 'production'
  end
$$;

revoke all on function private.is_fitting_trip_stage(uuid, text) from public;
revoke all on function private.workshop_location(uuid, text) from public;
grant execute on function private.is_fitting_trip_stage(uuid, text) to authenticated, service_role;
grant execute on function private.workshop_location(uuid, text) to authenticated, service_role;

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
        and new.current_stage::text is distinct from old.current_stage::text then
    if new.dress_location in ('production', 'branch', 'fitting')
       and private.is_handover_stage(new.id, new.current_stage::text) then
      new.dress_location := 'workshop';
    elsif new.dress_location = 'production'
       and private.is_fitting_trip_stage(new.id, new.current_stage::text) then
      new.dress_location := 'workshop';
    end if;
  end if;
  return new;
end $$;

-- الطلبات الواقفة الحين على مرحلة الإرسال للبروفة: القطعة جاهزة في المعمل
update public.orders o
   set dress_location = 'workshop'
 where o.state = 'active'
   and o.dress_location = 'production'
   and private.is_fitting_trip_stage(o.id, o.current_stage::text);

-- استلام الفرع يُنهي مرحلة التسليم للمحل أو الإرسال للبروفة، وينقل الطلب للمرحلة اللي بعدها
create or replace function private.complete_handover_on_receive() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_stage text;
  v_pos integer;
  v_next text;
begin
  if not (old.dress_location = 'transit' and new.dress_location in ('branch', 'fitting')
          and new.state = 'active') then
    return new;
  end if;
  v_stage := new.current_stage::text;
  if not (private.is_handover_stage(new.id, v_stage)
          or private.is_fitting_trip_stage(new.id, v_stage)) then
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

-- إنهاء المراحل: التعديل المفتوح، والفستان اللي للحين في المعمل أو الطريق، وقطعة البروفة في الفرع
create or replace function private.guard_delivery_stage() returns trigger
    language plpgsql
    set search_path to 'public'
    as $$
declare v_loc text;
begin
  if new.status::text in ('done', 'review') and old.status::text not in ('done', 'review') then
    if private.open_alteration_blocks(new.order_id, new.id, new.stage::text) then
      raise exception 'فيه تعديل مفتوح على الطلب — المرحلة تكمل بعد ما تقبل العميلة التعديل';
    end if;
    select dress_location into v_loc from public.orders where id = new.order_id;
    if private.is_fitting_trip_stage(new.order_id, new.stage::text) then
      -- مرحلة الإرسال للبروفة تنتهي باستلام الفرع للقطعة
      if v_loc in ('workshop', 'transit') then
        raise exception 'قطعة البروفة للحين % — المرحلة تنتهي لما يؤكّد الفرع الاستلام',
          case v_loc when 'workshop' then 'في المعمل، أرسلها من المخزون' else 'في الطريق للفرع' end;
      end if;
    elsif v_loc = 'fitting' then
      raise exception 'قطعة البروفة للحين في الفرع — سجّل نتيجة البروفة وأرجعها للمعمل أول';
    end if;
    if new.stage::text = private.last_required_stage(new.order_id)
       and v_loc in ('workshop', 'transit', 'returning') then
      raise exception 'الفستان للحين % — أرسله من المعمل وأكّد استلامه في الفرع قبل التسليم',
        case v_loc when 'workshop' then 'في المعمل'
                   when 'transit' then 'في الطريق للفرع'
                   else 'في الطريق للمعمل' end;
    end if;
  end if;
  return new;
end $$;

-- ما يُسلَّم الطلب وفستانه للحين في المعمل أو الطريق أو في الفرع للبروفة
create or replace function private.guard_order_delivery() returns trigger
    language plpgsql
    set search_path to 'public'
    as $$
begin
  if new.state = 'delivered' and old.state <> 'delivered'
     and old.dress_location in ('workshop', 'transit', 'fitting', 'returning') then
    raise exception '%', case old.dress_location
      when 'workshop' then 'الفستان للحين في المعمل — أرسله من المعمل وأكّد استلامه في الفرع قبل التسليم'
      when 'transit' then 'الفستان للحين في الطريق للفرع — أكّد استلامه في الفرع قبل التسليم'
      when 'fitting' then 'قطعة البروفة للحين في الفرع — سجّل نتيجة البروفة وأرجعها للمعمل أول'
      else 'القطعة في الطريق للمعمل — ما ينسلّم الطلب قبل ما يكمل'
    end;
  end if;
  return new;
end $$;

-- ===== 4) الجاهز في المعمل والفروع (مع قطع البروفة) =====
drop function if exists public.ready_orders();
create function public.ready_orders()
returns table (
  id uuid,
  order_no text,
  client_name text,
  client_phone text,
  branch_id uuid,
  order_kind public.order_kind,
  event_date date,
  due_date date,
  parts text[],
  dress_location text,
  for_fitting boolean
)
    language sql stable security definer
    set search_path to 'public'
    as $$
  select o.id, o.order_no, o.client_name, o.client_phone, o.branch_id, o.order_kind,
         o.event_date, o.due_date, o.parts, o.dress_location,
         o.dress_location in ('fitting', 'returning')
           or private.is_fitting_trip_stage(o.id, o.current_stage::text)
    from public.orders o
   where o.state = 'active'
     and o.dress_location in ('workshop', 'transit', 'branch', 'fitting', 'returning')
     and (private.can(auth.uid(), 'goods.transfer') or private.can(auth.uid(), 'orders.view_all'))
     and private.goods_place_ok(auth.uid(), o.branch_id, o.dress_location in ('workshop', 'returning'))
   order by o.due_date nulls last, o.order_no
$$;

revoke all on function public.ready_orders() from public, anon;
grant execute on function public.ready_orders() to authenticated;

-- ===== 5) الشحنة الراجعة للمعمل =====
alter table public.goods_transfers
  add column if not exists to_workshop boolean not null default false;

drop policy if exists "goods transfers readable" on public.goods_transfers;
create policy "goods transfers readable" on public.goods_transfers
for select to authenticated
using (
  private.is_team(auth.uid())
  and (private.branch_ok(auth.uid(), to_branch_id)
       or private.goods_place_ok(auth.uid(), from_branch_id, from_workshop)
       or (to_workshop and private.workshop_ok(auth.uid())))
);

drop policy if exists "goods transfer lines readable" on public.goods_transfer_lines;
create policy "goods transfer lines readable" on public.goods_transfer_lines
for select to authenticated
using (exists (
  select 1 from public.goods_transfers t
   where t.id = transfer_id
     and private.is_team(auth.uid())
     and (private.branch_ok(auth.uid(), t.to_branch_id)
          or private.goods_place_ok(auth.uid(), t.from_branch_id, t.from_workshop)
          or (t.to_workshop and private.workshop_ok(auth.uid())))
));

-- نواقص رحلة البروفة: ما رجع من الفرع، وما وصل للمعمل
alter table public.part_issues drop constraint if exists part_issues_stage_check;
alter table public.part_issues add constraint part_issues_stage_check
  check (stage in ('send', 'receive', 'deliver', 'rental_out', 'rental_return',
                   'fitting_back', 'workshop_receive'));

-- ===== 6) نتيجة البروفة =====
create table if not exists public.order_fittings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  number integer not null,
  -- مرحلة الإرسال للبروفة اللي رجعت منها القطعة
  stage text,
  result text not null check (result in ('approved', 'redo')),
  -- [{"part": "الفستان", "points": ["تضييق الخصر ٢ سم"]}]
  items jsonb not null default '[]'::jsonb,
  supervisor_note text not null,
  returned_parts text[] not null default '{}',
  transfer_id uuid references public.goods_transfers(id) on delete set null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists order_fittings_order_idx on public.order_fittings(order_id);

grant select on public.order_fittings to authenticated;
grant all on public.order_fittings to service_role;
alter table public.order_fittings enable row level security;

drop policy if exists "order fittings readable" on public.order_fittings;
create policy "order fittings readable" on public.order_fittings
for select to authenticated
using (private.is_team(auth.uid())
       and (private.order_visible_id(auth.uid(), order_id) or private.workshop_ok(auth.uid())));

-- تسجيل نتيجة البروفة والتعديلات وتهميش المشرف، وإرجاع القطعة للمعمل بالتأشير
-- p_result: approved (معتمدة، يكمل الطلب) | redo (إعادة بروفة، يرجع لمرحلة تجهيز البروفة)
create or replace function public.return_from_fitting(
  p_order_id uuid,
  p_result text,
  p_items jsonb,
  p_note text,
  p_parts text[]
) returns uuid
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  o public.orders;
  v_branch uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_items jsonb;
  v_check text[];
  v_sent text[];
  v_no integer;
  v_title text;
  v_transfer uuid;
  v_line uuid;
  v_trip text;
  v_trip_pos integer;
  v_back text;
  v_back_pos integer;
  v_fitting uuid;
  v_summary text;
  v_user uuid;
begin
  if not private.can(auth.uid(), 'alterations.approve') then
    raise exception 'تسجيل نتيجة البروفة لمشرف الفرع';
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then
    raise exception 'الطلب غير موجود';
  end if;
  if o.state <> 'active' or o.dress_location <> 'fitting' then
    raise exception 'قطعة البروفة مو موجودة في الفرع';
  end if;

  -- فرع الطلب، وإلا الفرع اللي استلم القطعة
  v_branch := coalesce(o.branch_id, (
    select t.to_branch_id
      from public.goods_transfer_lines l
      join public.goods_transfers t on t.id = l.transfer_id
     where l.order_id = o.id and t.status = 'received' and not t.to_workshop
     order by t.received_at desc nulls last
     limit 1));
  if v_branch is null then
    raise exception 'حدد فرع الطلب أول';
  end if;
  if not private.branch_ok(auth.uid(), v_branch) then
    raise exception 'غير مصرح لهذا الفرع';
  end if;

  if coalesce(p_result, '') not in ('approved', 'redo') then
    raise exception 'اختر نتيجة البروفة';
  end if;
  if v_note is null then
    raise exception 'اكتب تهميش المشرف';
  end if;

  -- التعديلات: كل قطعة لازم فيها نقطة وحدة على الأقل
  select coalesce(jsonb_agg(jsonb_build_object('part', btrim(e->>'part'), 'points', x.pts)), '[]'::jsonb)
    into v_items
    from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) e
    cross join lateral (
      select coalesce(jsonb_agg(btrim(p)), '[]'::jsonb) as pts
        from jsonb_array_elements_text(
               case when jsonb_typeof(e->'points') = 'array' then e->'points' else '[]'::jsonb end) p
       where btrim(p) <> ''
    ) x
   where coalesce(btrim(e->>'part'), '') <> '' and jsonb_array_length(x.pts) > 0;

  if p_result = 'redo' and jsonb_array_length(v_items) = 0 then
    raise exception 'إعادة البروفة تحتاج نقطة تعديل وحدة على الأقل';
  end if;

  v_check := private.parts_or_dress(o.parts);
  v_sent := array(select x from unnest(v_check) as x where x = any(coalesce(p_parts, '{}')));
  if cardinality(v_sent) = 0 then
    raise exception 'أشّر على القطع الراجعة للمعمل';
  end if;

  -- مرحلة الإرسال للبروفة اللي رجعت منها القطعة (آخر وحدة انتهت)
  select s.stage::text, s.position into v_trip, v_trip_pos
    from public.order_stages s
    join public.stage_templates t on t.stage::text = s.stage::text
   where s.order_id = o.id and t.sends_for_fitting and s.is_required
   order by (s.status::text = 'done') desc, s.position desc
   limit 1;

  select coalesce(max(number), 0) + 1 into v_no from public.order_fittings where order_id = o.id;
  v_title := 'طلب ' || o.order_no || ' — ' || o.client_name || ' (راجع من البروفة)';

  insert into public.goods_transfers
    (transfer_no, from_branch_id, from_workshop, to_branch_id, to_workshop, notes, sent_by)
  values
    ('T-' || lpad(nextval('public.goods_transfer_seq')::text, 5, '0'),
     v_branch, false, v_branch, true, 'تهميش المشرف: ' || v_note, auth.uid())
  returning id into v_transfer;

  insert into public.goods_transfer_lines
    (transfer_id, order_id, qty, title, checklist, sent, position)
  values
    (v_transfer, o.id, 1, v_title, v_check, v_sent, 1)
  returning id into v_line;

  if cardinality(private.text_minus(v_check, v_sent)) > 0 then
    insert into public.part_issues (stage, branch_id, transfer_line_id, order_id, title, missing, created_by)
    values ('fitting_back', v_branch, v_line, o.id, v_title,
            private.text_minus(v_check, v_sent), auth.uid());
  end if;

  insert into public.order_fittings
    (order_id, number, stage, result, items, supervisor_note, returned_parts, transfer_id, created_by)
  values
    (o.id, v_no, v_trip, p_result, v_items, v_note, v_sent, v_transfer, auth.uid())
  returning id into v_fitting;

  -- إعادة البروفة: الطلب يرجع للمرحلة المطلوبة اللي قبل الإرسال للبروفة (تجهيز البروفة)
  if p_result = 'redo' and v_trip_pos is not null then
    select stage::text, position into v_back, v_back_pos
      from public.order_stages
     where order_id = o.id and is_required and position < v_trip_pos
     order by position desc
     limit 1;
  end if;

  if v_back is not null then
    update public.order_stages
       set status = case when stage::text = v_back then 'in_progress'::public.stage_status
                         else 'pending'::public.stage_status end,
           started_at = case when stage::text = v_back then now() else null end,
           completed_at = null,
           duration_minutes = null,
           review_status = null,
           rework_count = rework_count + case when stage::text = v_back then 1 else 0 end
     where order_id = o.id
       and is_required
       and position >= v_back_pos
       and position <= (select position from public.order_stages
                         where order_id = o.id and stage::text = o.current_stage::text
                         limit 1);
    update public.orders set dress_location = 'returning', current_stage = v_back where id = o.id;
  else
    update public.orders set dress_location = 'returning' where id = o.id;
  end if;

  select string_agg((e->>'part') || ': ' || (
           select string_agg(p, '، ') from jsonb_array_elements_text(e->'points') p), ' · ')
    into v_summary
    from jsonb_array_elements(v_items) e;

  perform private.log_activity(o.id, null, 'fitting_result',
    'البروفة ' || v_no || ': '
    || case p_result when 'approved' then 'معتمدة' else 'إعادة بروفة' end
    || coalesce(' — ' || v_summary, '') || ' · تهميش المشرف: ' || v_note);
  perform private.log_activity(o.id, null, 'dress_sent',
    'أُرجعت قطعة البروفة للمعمل: ' || array_to_string(v_sent, '، '));
  -- تنبيه موظفي المعمل (اللي يستلمون، ومشرف تعديلات المعمل)
  for v_user in
    select p.id from public.profiles p
     where p.is_active
       and p.id is distinct from auth.uid()
       and not private.has_role(p.id, 'admin')
       and ((private.can(p.id, 'goods.transfer') and private.workshop_ok(p.id))
            or private.can(p.id, 'alterations.workshop'))
  loop
    perform private.notify(v_user, o.id, null, 'task_assigned',
      'قطعة بروفة طلب ' || o.order_no || ' راجعة للمعمل مع التعديلات — أكّد استلامها');
  end loop;
  return v_fitting;
end $$;

revoke all on function public.return_from_fitting(uuid, text, jsonb, text, text[]) from public, anon;
grant execute on function public.return_from_fitting(uuid, text, jsonb, text, text[]) to authenticated;

-- ===== 7) استلام شحنة (فرع، أو المعمل للقطع الراجعة من البروفة) =====
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
  if t.to_workshop then
    if not private.workshop_ok(auth.uid()) then
      raise exception 'الاستلام في المعمل لموظفي المعمل';
    end if;
  elsif not private.branch_ok(auth.uid(), t.to_branch_id) then
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
        values (l.item_id, t.to_branch_id, t.to_workshop, v_got_qty)
        on conflict (item_id, branch_id, at_workshop)
        do update set qty = public.goods_stock.qty + excluded.qty, updated_at = now();
        insert into public.goods_movements
          (item_id, branch_id, at_workshop, qty, kind, transfer_id, notes, created_by)
        values
          (l.item_id, t.to_branch_id, t.to_workshop, v_got_qty, 'receive', t.id, 'استلام من ' || v_from, auth.uid());
      end if;
    elsif l.order_id is not null and l.followup_issue_id is null and t.to_workshop then
      -- قطعة راجعة من البروفة: ترجع للإنتاج (أو جاهزة للإرسال لو الطلب واقف على مرحلة إرسال)
      update public.orders
         set dress_location = private.workshop_location(id, current_stage::text)
       where id = l.order_id and dress_location = 'returning';
      perform private.log_activity(l.order_id, null, 'dress_received',
        'استلم المعمل قطعة البروفة: ' || coalesce(nullif(array_to_string(v_got, '، '), ''), 'لا شيء'));
    elsif l.order_id is not null and l.followup_issue_id is null then
      -- قطعة البروفة تبقى في الفرع «للبروفة»، والفستان الجاهز «في الفرع»
      update public.orders
         set dress_location = case when private.is_fitting_trip_stage(id, current_stage::text)
                                   then 'fitting' else 'branch' end
       where id = l.order_id and dress_location = 'transit';
      perform private.log_activity(l.order_id, null, 'dress_received',
        'استلم الفرع: ' || coalesce(nullif(array_to_string(v_got, '، '), ''), 'لا شيء'));
    elsif l.order_id is not null then
      perform private.log_activity(l.order_id, null, 'dress_received',
        'استلم الفرع القطع الناقصة: ' || coalesce(nullif(array_to_string(v_got, '، '), ''), 'لا شيء'));
    end if;

    if cardinality(v_missing) > 0 then
      insert into public.part_issues (stage, branch_id, transfer_line_id, order_id, title, missing, created_by)
      values (case when t.to_workshop then 'workshop_receive' else 'receive' end,
              t.to_branch_id, l.id, l.order_id, l.title, v_missing, auth.uid());
    end if;
  end loop;

  update public.goods_transfers
     set status = 'received', received_by = auth.uid(), received_at = now()
   where id = t.id;
end $$;

commit;
