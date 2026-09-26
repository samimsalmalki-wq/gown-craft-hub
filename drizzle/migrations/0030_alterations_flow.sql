-- قسم التعديلات: التعديل ينطلب من داخل الطلب حسب المرحلة اللي وصل لها، ويمشي بمسار كامل:
--   طلب (المبيعات) ← تعميد وتهميش مشرف الفرع ← مراجعة الإدارة ← إرسال للمعمل بقائمة القطع
--   ← استلام المعمل وطباعة كرت التشغيل (يتحدد الخياط) ← التنفيذ ← إرسال للفرع ← استلام الفرع
--   ← العميلة قبلت (ينتهي) أو ما قبلت (ينتهي وينفتح تعديل جديد).
-- الطابور مرتب بموعد استلام العميلة، والتعديل لازم يكون جاهز في الفرع بنفس اليوم.
-- الرسوم (أحيانًا) تنحصّل بفاتورة شاملة الضريبة وسند قبض، وإيرادها في «إيرادات التعديلات».
-- الطلب يوقف عند المرحلة اللي انطلب فيها التعديل، والتسليم للعميلة ينقفل لين يخلص التعديل.

-- نطاق مالي جديد لرسوم التعديلات (يُقارن كنص داخل الدوال لأن القيمة الجديدة
-- ما تُستعمل قبل انتهاء نفس المعاملة)
alter type public.finance_scope add value if not exists 'alteration';

begin;

set local lock_timeout = '20s';
-- نقفل الجداول اللي تتغير سياساتها مرة وحدة بنفس الترتيب (عشان ما يصير تعارض مع الشغل الحي)
lock table public.alterations, public.invoices, public.invoice_lines in access exclusive mode;

-- ===== 1) الحسابات =====
insert into public.gl_accounts (code, name, type, parent_id) values
  ('1240', 'مدينون — رسوم التعديلات', 'asset', (select id from public.gl_accounts where code = '1000'))
on conflict (code) do nothing;

-- ===== 2) الخياطين (أسماء بدون حسابات) =====
create table if not exists public.tailors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists tailors_one_default on public.tailors ((true)) where is_default;

grant select, insert, update, delete on public.tailors to authenticated;
grant all on public.tailors to service_role;
alter table public.tailors enable row level security;

drop policy if exists "tailors read" on public.tailors;
create policy "tailors read" on public.tailors for select to authenticated
using (private.is_team(auth.uid()));

drop policy if exists "tailors manage" on public.tailors;
create policy "tailors manage" on public.tailors for all to authenticated
using (private.can(auth.uid(), 'alterations.workshop') or private.can(auth.uid(), 'catalog.manage'))
with check (private.can(auth.uid(), 'alterations.workshop') or private.can(auth.uid(), 'catalog.manage'));

-- خياط افتراضي واحد فقط
create or replace function private.single_default_tailor() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
begin
  if new.is_default then
    update public.tailors set is_default = false where is_default and id <> new.id;
  end if;
  return new;
end $$;

revoke all on function private.single_default_tailor() from public;

drop trigger if exists tailors_single_default on public.tailors;
create trigger tailors_single_default before insert or update of is_default on public.tailors
  for each row execute function private.single_default_tailor();

insert into public.tailors (name, is_default)
select 'خياط التعديلات', true
 where not exists (select 1 from public.tailors);

-- ===== 3) أعمدة التعديل =====
alter table public.alterations
  add column if not exists step text not null default 'new',
  add column if not exists branch_id uuid references public.branches(id) on delete set null,
  add column if not exists source_stage text,
  add column if not exists after_delivery boolean not null default false,
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists pickup_date date,
  add column if not exists fee numeric(12,2) not null default 0,
  add column if not exists fee_invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists fee_paid_at timestamptz,
  add column if not exists sketch_path text,
  add column if not exists supervisor_note text,
  add column if not exists admin_note text,
  add column if not exists tailor text,
  add column if not exists printed_at timestamptz,
  add column if not exists client_result text,
  add column if not exists history jsonb not null default '[]'::jsonb;

alter table public.alterations drop constraint if exists alterations_step_check;
alter table public.alterations add constraint alterations_step_check check (step in (
  'new', 'review', 'approved', 'to_workshop', 'queued', 'in_progress',
  'to_branch', 'at_branch', 'done', 'cancelled'
));

alter table public.alterations drop constraint if exists alterations_fee_check;
alter table public.alterations add constraint alterations_fee_check check (fee >= 0);

create index if not exists alterations_open_idx on public.alterations (pickup_date)
  where step not in ('done', 'cancelled');
create index if not exists alterations_branch_idx on public.alterations (branch_id);

-- الحالة العامة القديمة تتبع خطوة المسار
create or replace function private.alteration_sync_status() returns trigger
    language plpgsql
    set search_path to 'public'
    as $$
begin
  new.status := (case
    when new.step = 'done' then 'done'
    when new.step = 'cancelled' then 'cancelled'
    when new.step in ('new', 'review', 'approved') then 'requested'
    else 'in_progress'
  end)::public.alteration_status;
  new.completed_at := case when new.step in ('done', 'cancelled')
                           then coalesce(new.completed_at, now()) end;
  return new;
end $$;

revoke all on function private.alteration_sync_status() from public;

drop trigger if exists alterations_sync_status on public.alterations;
create trigger alterations_sync_status before insert or update of step on public.alterations
  for each row execute function private.alteration_sync_status();

-- السجل يُكتب من دوال المسار (بدل التسجيل التلقائي القديم)
drop trigger if exists alterations_audit_ins on public.alterations;
drop trigger if exists alterations_audit_upd on public.alterations;

-- ===== 4) الصلاحيات =====
-- القراءة: من يشوف الطلب، أو المعمل، أو الإدارة، أو مشرف الفرع في فرعه.
-- الكتابة كلها من دوال المسار فقط.
revoke insert, update, delete on public.alterations from authenticated;
grant select on public.alterations to authenticated;
grant all on public.alterations to service_role;

drop policy if exists "alterations readable by team" on public.alterations;
drop policy if exists "alterations insert" on public.alterations;
drop policy if exists "alterations update" on public.alterations;
drop policy if exists "alterations read" on public.alterations;
create policy "alterations read" on public.alterations for select to authenticated
using (
  private.is_team(auth.uid()) and (
    private.can(auth.uid(), 'alterations.workshop')
    or private.can(auth.uid(), 'alterations.review')
    or (private.can(auth.uid(), 'alterations.approve') and private.branch_ok(auth.uid(), branch_id))
    or private.order_visible_id(auth.uid(), order_id)
  )
);

-- فاتورة الرسوم: تنقرأ للطباعة لمن يحصّلها أو يتابع التعديلات في فرعه
drop policy if exists "alteration fee invoices read" on public.invoices;
create policy "alteration fee invoices read" on public.invoices for select to authenticated
using (
  scope::text = 'alteration'
  and (private.can(auth.uid(), 'payments.collect') or private.can(auth.uid(), 'alterations.request')
       or private.can(auth.uid(), 'alterations.approve'))
  and private.branch_ok(auth.uid(), branch_id)
);

drop policy if exists "alteration fee invoice lines read" on public.invoice_lines;
create policy "alteration fee invoice lines read" on public.invoice_lines for select to authenticated
using (exists (
  select 1 from public.invoices i
   where i.id = invoice_id
     and i.scope::text = 'alteration'
     and (private.can(auth.uid(), 'payments.collect') or private.can(auth.uid(), 'alterations.request')
          or private.can(auth.uid(), 'alterations.approve'))
     and private.branch_ok(auth.uid(), i.branch_id)
));

-- ===== 5) أدوات المسار =====
create or replace function private.alt_event(_text text) returns jsonb
    language sql stable security definer
    set search_path to 'public'
    as $$
  select jsonb_build_object(
    'at', now(),
    'by', auth.uid(),
    'name', coalesce((select full_name from public.profiles where id = auth.uid()), ''),
    'text', _text)
$$;

revoke all on function private.alt_event(text) from public;

-- تنبيه كل من عنده الصلاحية (في فرع الطلب). المدير ما يوصله إلا طلب المراجعة.
create or replace function private.notify_permission(
  _perm text, _branch uuid, _order uuid, _kind text, _message text
) returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare u record;
begin
  for u in
    select p.id from public.profiles p
     where p.is_active
       and p.id is distinct from auth.uid()
       and private.can(p.id, _perm)
       and (_perm = 'alterations.review' or not private.has_role(p.id, 'admin'))
       and (_branch is null or _perm = 'alterations.workshop' or private.branch_ok(p.id, _branch))
  loop
    perform private.notify(u.id, _order, null, _kind, _message);
  end loop;
end $$;

revoke all on function private.notify_permission(text, uuid, uuid, text, text) from public;

-- التعديل المفتوح يوقف المرحلة اللي انطلب فيها، ويقفل آخر مرحلة (التسليم للعميلة)
create or replace function private.open_alteration_blocks(_order uuid, _stage_id uuid, _stage text)
    returns boolean
    language sql stable security definer
    set search_path to 'public'
    as $$
  select exists (
    select 1 from public.alterations a
     where a.order_id = _order
       and a.step not in ('done', 'cancelled')
       and not a.after_delivery
       and (a.stage_id = _stage_id or _stage = private.last_required_stage(_order))
  )
$$;

revoke all on function private.open_alteration_blocks(uuid, uuid, text) from public;
grant execute on function private.open_alteration_blocks(uuid, uuid, text) to authenticated, service_role;

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
    if new.stage::text = private.last_required_stage(new.order_id) then
      select dress_location into v_loc from public.orders where id = new.order_id;
      if v_loc in ('workshop', 'transit') then
        raise exception 'الفستان للحين % — أرسله من المعمل وأكّد استلامه في الفرع قبل التسليم',
          case v_loc when 'workshop' then 'في المعمل' else 'في الطريق للفرع' end;
      end if;
    end if;
  end if;
  return new;
end $$;

-- ===== 6) طلب التعديل من داخل الطلب =====
-- p_items: [{"part": "الفستان", "points": ["تضييق الخصر ٢ سم", "..."]}, ...]
create or replace function public.request_alteration(
  p_order_id uuid,
  p_items jsonb,
  p_pickup_date date,
  p_fee numeric default 0,
  p_sketch_path text default null
) returns uuid
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  o public.orders;
  v_items jsonb;
  v_after boolean;
  v_stage_id uuid;
  v_stage_label text;
  v_no integer;
  v_desc text;
  v_source text;
  v_id uuid;
begin
  if not private.can(auth.uid(), 'alterations.request') then
    raise exception 'غير مصرح';
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null or not private.order_visible(auth.uid(), o.id, o.branch_id, o.created_by) then
    raise exception 'الطلب غير موجود';
  end if;
  if o.state = 'cancelled' then
    raise exception 'الطلب ملغي';
  end if;
  if exists (select 1 from public.alterations
              where order_id = o.id and step not in ('done', 'cancelled')) then
    raise exception 'فيه تعديل مفتوح على هذا الطلب — كمّله أول';
  end if;

  -- تنظيف النقاط: كل قطعة لازم فيها نقطة وحدة على الأقل
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

  if jsonb_array_length(v_items) = 0 then
    raise exception 'أضف نقطة تعديل وحدة على الأقل';
  end if;
  if p_pickup_date is null then
    raise exception 'حدد موعد استلام العميلة';
  end if;
  if coalesce(p_fee, 0) < 0 then
    raise exception 'الرسوم غير صحيحة';
  end if;

  v_after := o.state = 'delivered';
  if not v_after then
    select id into v_stage_id from public.order_stages
     where order_id = o.id and stage::text = o.current_stage::text
     limit 1;
    select label into v_stage_label from public.stage_templates
     where stage::text = o.current_stage::text;
  end if;
  v_source := case when v_after then 'رجيع بعد التسليم'
                   else 'في ' || coalesce(v_stage_label, o.current_stage::text) end;

  select coalesce(max(number), 0) + 1 into v_no from public.alterations where order_id = o.id;
  select string_agg((e->>'part') || ': ' || (
           select string_agg(p, '، ') from jsonb_array_elements_text(e->'points') p), ' · ')
    into v_desc
    from jsonb_array_elements(v_items) e;

  insert into public.alterations
    (order_id, stage_id, number, description, created_by, step, branch_id, source_stage,
     after_delivery, items, pickup_date, fee, sketch_path, history)
  values
    (o.id, v_stage_id, v_no, v_desc, auth.uid(), 'new', o.branch_id,
     case when v_after then null else o.current_stage::text end,
     v_after, v_items, p_pickup_date, round(coalesce(p_fee, 0), 2),
     nullif(btrim(coalesce(p_sketch_path, '')), ''),
     jsonb_build_array(private.alt_event('طلب التعديل ' || v_source)))
  returning id into v_id;

  perform private.log_activity(o.id, v_stage_id, 'alteration_added',
    'تعديل ' || v_no || ' ' || v_source || ': ' || v_desc);
  perform private.notify_permission('alterations.approve', o.branch_id, o.id, 'review_needed',
    'تعديل ' || v_no || ' على طلب ' || o.order_no || ' ينتظر تعميدك');
  return v_id;
end $$;

revoke all on function public.request_alteration(uuid, jsonb, date, numeric, text) from public, anon;
grant execute on function public.request_alteration(uuid, jsonb, date, numeric, text) to authenticated;

-- ===== 7) خطوات المسار =====
-- p_action: approve | review_ok | review_back | send_workshop | receive_workshop | set_tailor
--           | start | send_branch | receive_branch | accept | reject | cancel | set_fee
create or replace function public.alteration_action(
  p_id uuid,
  p_action text,
  p_note text default null,
  p_parts text[] default null,
  p_tailor text default null,
  p_fee numeric default null
) returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  a public.alterations;
  o public.orders;
  v_uid uuid := auth.uid();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_tailor text := nullif(btrim(coalesce(p_tailor, '')), '');
  v_parts text[];
  v_all text[];
  v_missing text[];
  v_text text;
  v_title text;
  v_branch_ok boolean;
begin
  select * into a from public.alterations where id = p_id for update;
  if a.id is null then
    raise exception 'التعديل غير موجود';
  end if;
  select * into o from public.orders where id = a.order_id;
  v_branch_ok := private.branch_ok(v_uid, a.branch_id);
  v_title := 'تعديل ' || a.number || ' — طلب ' || o.order_no;

  -- القطع المرسلة من قائمة التشييك
  v_all := array(select e->>'part' from jsonb_array_elements(a.items) e);
  v_parts := array(select x from unnest(v_all) as x where x = any(coalesce(p_parts, '{}')));
  v_missing := private.text_minus(v_all, v_parts);

  if p_action = 'approve' then
    if a.step <> 'new' then raise exception 'التعديل مو بانتظار التعميد'; end if;
    if not (private.can(v_uid, 'alterations.approve') and v_branch_ok) then
      raise exception 'التعميد لمشرف الفرع';
    end if;
    update public.alterations
       set step = 'review', supervisor_note = v_note, admin_note = null,
           history = history || private.alt_event(
             'عمّده مشرف الفرع' || coalesce(' وهمّش: ' || v_note, ''))
     where id = a.id;
    v_text := 'عمّده مشرف الفرع';
    perform private.notify_permission('alterations.review', null, o.id, 'review_needed',
      v_title || ' ينتظر مراجعة الإدارة');

  elsif p_action in ('review_ok', 'review_back') then
    if a.step <> 'review' then raise exception 'التعديل مو بانتظار مراجعة الإدارة'; end if;
    if not private.can(v_uid, 'alterations.review') then
      raise exception 'المراجعة للإدارة';
    end if;
    if p_action = 'review_ok' then
      update public.alterations
         set step = 'approved', admin_note = v_note,
             history = history || private.alt_event(
               'اعتمدته الإدارة' || coalesce(': ' || v_note, ''))
       where id = a.id;
      v_text := 'اعتمدته الإدارة';
      perform private.notify_permission('alterations.approve', a.branch_id, o.id, 'approved',
        v_title || ' اعتمدته الإدارة — أرسله للمعمل');
    else
      if v_note is null then raise exception 'اكتب سبب الإرجاع للمشرف'; end if;
      update public.alterations
         set step = 'new', admin_note = v_note,
             history = history || private.alt_event('رجّعته الإدارة للمشرف: ' || v_note)
       where id = a.id;
      v_text := 'رجّعته الإدارة للمشرف: ' || v_note;
      perform private.notify_permission('alterations.approve', a.branch_id, o.id, 'rejected',
        v_title || ' رجّعته الإدارة: ' || v_note);
    end if;

  elsif p_action = 'send_workshop' then
    if a.step <> 'approved' then raise exception 'التعديل لازم يعتمد قبل الإرسال'; end if;
    if not (private.can(v_uid, 'alterations.approve') and v_branch_ok) then
      raise exception 'الإرسال للمعمل لمشرف الفرع';
    end if;
    if cardinality(v_parts) = 0 then raise exception 'أشّر على القطع المرسلة'; end if;
    v_text := 'أُرسل للمعمل: ' || array_to_string(v_parts, '، ')
      || case when cardinality(v_missing) > 0
              then ' — ما انرسل: ' || array_to_string(v_missing, '، ') else '' end;
    update public.alterations
       set step = 'to_workshop', history = history || private.alt_event(v_text)
     where id = a.id;
    perform private.notify_permission('alterations.workshop', null, o.id, 'task_assigned',
      v_title || ' في الطريق للمعمل');

  elsif p_action = 'receive_workshop' then
    if a.step <> 'to_workshop' then raise exception 'التعديل مو في الطريق للمعمل'; end if;
    if not private.can(v_uid, 'alterations.workshop') then
      raise exception 'الاستلام لمشرف المعمل';
    end if;
    v_tailor := coalesce(v_tailor, a.tailor,
      (select name from public.tailors where is_default and is_active limit 1),
      (select name from public.tailors where is_active order by created_at limit 1));
    v_text := 'استلمه المعمل وطبع كرت التشغيل' || coalesce(' — الخياط: ' || v_tailor, '');
    update public.alterations
       set step = 'queued', tailor = v_tailor, printed_at = now(),
           history = history || private.alt_event(v_text)
     where id = a.id;

  elsif p_action = 'set_tailor' then
    if a.step not in ('queued', 'in_progress') then
      raise exception 'الخياط يتحدد بعد استلام المعمل';
    end if;
    if not private.can(v_uid, 'alterations.workshop') then raise exception 'غير مصرح'; end if;
    if v_tailor is null then raise exception 'اختر الخياط'; end if;
    if v_tailor is not distinct from a.tailor then return; end if;
    v_text := 'تغيّر الخياط إلى ' || v_tailor;
    update public.alterations
       set tailor = v_tailor, history = history || private.alt_event(v_text)
     where id = a.id;

  elsif p_action = 'start' then
    if a.step <> 'queued' then raise exception 'التعديل مو في طابور المعمل'; end if;
    if not private.can(v_uid, 'alterations.workshop') then raise exception 'غير مصرح'; end if;
    v_text := 'بدأ التنفيذ' || coalesce(' — ' || a.tailor, '');
    update public.alterations
       set step = 'in_progress', history = history || private.alt_event(v_text)
     where id = a.id;

  elsif p_action = 'send_branch' then
    if a.step <> 'in_progress' then raise exception 'التعديل مو قيد التنفيذ'; end if;
    if not private.can(v_uid, 'alterations.workshop') then raise exception 'غير مصرح'; end if;
    if cardinality(v_parts) = 0 then raise exception 'أشّر على القطع المرسلة'; end if;
    v_text := 'جاهز — أُرسل للفرع: ' || array_to_string(v_parts, '، ')
      || case when cardinality(v_missing) > 0
              then ' — ما انرسل: ' || array_to_string(v_missing, '، ') else '' end;
    update public.alterations
       set step = 'to_branch', history = history || private.alt_event(v_text)
     where id = a.id;
    perform private.notify_permission('alterations.approve', a.branch_id, o.id, 'task_assigned',
      v_title || ' جاهز وفي الطريق للفرع');

  elsif p_action = 'receive_branch' then
    if a.step <> 'to_branch' then raise exception 'التعديل مو في الطريق للفرع'; end if;
    if not ((private.can(v_uid, 'alterations.approve') or private.can(v_uid, 'alterations.request'))
            and v_branch_ok) then
      raise exception 'الاستلام للفرع';
    end if;
    v_text := 'استلمه الفرع — جاهز للتجربة';
    update public.alterations
       set step = 'at_branch', history = history || private.alt_event(v_text)
     where id = a.id;
    perform private.notify(a.created_by, o.id, null, 'approved',
      v_title || ' وصل الفرع وجاهز للتجربة');

  elsif p_action in ('accept', 'reject') then
    if a.step <> 'at_branch' then raise exception 'التعديل مو في الفرع'; end if;
    if not ((private.can(v_uid, 'alterations.request') or private.can(v_uid, 'alterations.approve'))
            and v_branch_ok) then
      raise exception 'غير مصرح';
    end if;
    if p_action = 'accept' then
      if a.fee > 0 and a.fee_paid_at is null then
        raise exception 'حصّل رسوم التعديل أول';
      end if;
      v_text := 'العميلة قبلت التعديل';
    else
      v_text := 'العميلة ما قبلت التعديل' || coalesce(': ' || v_note, '');
    end if;
    update public.alterations
       set step = 'done', client_result = case p_action when 'accept' then 'accepted' else 'rejected' end,
           history = history || private.alt_event(v_text)
     where id = a.id;

  elsif p_action = 'cancel' then
    if a.step in ('done', 'cancelled') then raise exception 'التعديل منتهي'; end if;
    if not (private.can(v_uid, 'alterations.review')
            or (a.step = 'new' and a.created_by = v_uid)
            or (a.step = 'new' and private.can(v_uid, 'alterations.approve') and v_branch_ok)) then
      raise exception 'الإلغاء للإدارة بعد التعميد';
    end if;
    if a.fee_paid_at is not null then
      raise exception 'الرسوم محصّلة — ما ينلغى التعديل';
    end if;
    if v_note is null then raise exception 'اكتب سبب الإلغاء'; end if;
    v_text := 'انلغى التعديل: ' || v_note;
    update public.alterations
       set step = 'cancelled', history = history || private.alt_event(v_text)
     where id = a.id;

  elsif p_action = 'set_fee' then
    if a.step in ('done', 'cancelled') then raise exception 'التعديل منتهي'; end if;
    if a.fee_paid_at is not null then raise exception 'الرسوم محصّلة'; end if;
    if not (private.can(v_uid, 'alterations.review')
            or (private.can(v_uid, 'alterations.approve') and v_branch_ok)) then
      raise exception 'غير مصرح';
    end if;
    if coalesce(p_fee, -1) < 0 then raise exception 'الرسوم غير صحيحة'; end if;
    if round(p_fee, 2) = a.fee then return; end if;
    v_text := case when p_fee = 0 then 'انشالت رسوم التعديل'
                   else 'رسوم التعديل صارت ' || round(p_fee, 2)::text end;
    update public.alterations
       set fee = round(p_fee, 2), history = history || private.alt_event(v_text)
     where id = a.id;

  else
    raise exception 'إجراء غير معروف';
  end if;

  perform private.log_activity(a.order_id, a.stage_id, 'alteration_status',
    'تعديل ' || a.number || ': ' || v_text);
end $$;

revoke all on function public.alteration_action(uuid, text, text, text[], text, numeric) from public, anon;
grant execute on function public.alteration_action(uuid, text, text, text[], text, numeric) to authenticated;

-- ===== 8) تحصيل رسوم التعديل: فاتورة شاملة الضريبة + سند قبض =====
create or replace function public.collect_alteration_fee(
  p_id uuid,
  p_method public.payment_method default 'cash'
) returns uuid
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  a public.alterations;
  o public.orders;
  v_vat_on boolean;
  v_rate numeric;
  v_invoice uuid;
  v_no text;
  v_desc text;
begin
  if not (private.can(auth.uid(), 'payments.collect') or private.can(auth.uid(), 'finance.payments')) then
    raise exception 'غير مصرح بالتحصيل';
  end if;
  select * into a from public.alterations where id = p_id for update;
  if a.id is null then
    raise exception 'التعديل غير موجود';
  end if;
  if a.step = 'cancelled' then
    raise exception 'التعديل ملغي';
  end if;
  if a.fee <= 0 then
    raise exception 'ما على التعديل رسوم';
  end if;
  if a.fee_paid_at is not null then
    raise exception 'الرسوم محصّلة من قبل';
  end if;
  select * into o from public.orders where id = a.order_id;
  if not private.branch_ok(auth.uid(), a.branch_id) then
    raise exception 'غير مصرح لهذا الفرع';
  end if;

  select vat_enabled, vat_rate into v_vat_on, v_rate
    from public.tax_settings
   order by (branch_id is not distinct from a.branch_id) desc, (branch_id is null) desc
   limit 1;
  v_vat_on := coalesce(v_vat_on, true);
  v_rate := case when v_vat_on then coalesce(v_rate, 15) else 0 end;
  v_desc := 'رسوم تعديل ' || a.number || ' — طلب ' || o.order_no;

  insert into public.invoices
    (scope, status, is_taxable, vat_rate, branch_id, client_name, client_phone, notes, created_by)
  values
    ('alteration', 'draft', v_vat_on, v_rate, a.branch_id, o.client_name,
     nullif(btrim(coalesce(o.client_phone, '')), ''), v_desc, auth.uid())
  returning id, invoice_no into v_invoice, v_no;

  insert into public.invoice_lines
    (invoice_id, description, qty, unit_price, unit_price_incl, list_price, position)
  values
    (v_invoice, v_desc, 1, round(a.fee * 100 / (100 + v_rate), 2), a.fee, a.fee, 1);

  update public.invoices set status = 'issued' where id = v_invoice;

  insert into public.payments
    (scope, invoice_id, amount, method, paid_at, notes, cash_account_id, branch_id, created_by)
  values
    ('alteration', v_invoice, a.fee, coalesce(p_method, 'cash'), current_date,
     v_desc || ' — ' || o.client_name,
     private.method_box(a.branch_id, coalesce(p_method, 'cash')), a.branch_id, auth.uid());

  update public.alterations
     set fee_invoice_id = v_invoice, fee_paid_at = now(),
         history = history || private.alt_event(
           'تحصيل رسوم التعديل ' || a.fee::text || ' — فاتورة ' || v_no)
   where id = a.id;

  perform private.log_activity(a.order_id, a.stage_id, 'payment_received',
    'رسوم تعديل ' || a.number || ' — فاتورة ' || v_no || ' — ' || a.fee::text);
  return v_invoice;
end $$;

revoke all on function public.collect_alteration_fee(uuid, public.payment_method) from public, anon;
grant execute on function public.collect_alteration_fee(uuid, public.payment_method) to authenticated;

-- ===== 9) قيود الرسوم: الفاتورة تثبت الإيراد والذمة، والسند يسدد الذمة =====
create or replace function public.post_invoice_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope text := new.scope::text;
  v_revenue text := case when new.scope::text = 'rental' then '4210' else '4110' end;
  v_delivered boolean := true;
  v_side text;
  v_lines jsonb;
  v_entry uuid;
begin
  -- الطلب لم يُسلَّم بعد: الضريبة تُفصل من الدفعة المقدمة (الإيجار يُفصل من الإيراد دائمًا)
  if v_scope = 'order' and new.order_id is not null then
    select coalesce(state = 'delivered', true) into v_delivered from public.orders where id = new.order_id;
  end if;
  v_side := case when v_delivered then v_revenue else '2110' end;

  -- إلغاء فاتورة صادرة
  if new.status = 'cancelled' and old.status = 'issued' then
    if v_scope in ('sale', 'alteration') or exists (
      select 1
        from public.journal_entries e
        join public.journal_lines l on l.entry_id = e.id
        join public.gl_accounts a on a.id = l.account_id
       where e.source = 'invoice' and e.source_id = new.id and a.code in ('1210', '1220')
    ) then
      -- البيع والرسوم والقيود القديمة: عكس القيد كما هو
      perform private.reverse_source_entries(
        array['invoice', 'invoice_fix'], new.id, 'إلغاء فاتورة ' || new.invoice_no, 'invoice_cancel');
    elsif new.tax_amount > 0 then
      -- ترجع الضريبة لمكانها الحالي: الدفعة المقدمة قبل التسليم، والإيراد بعده
      v_entry := private.post_entry(current_date, 'إلغاء فاتورة ' || new.invoice_no,
        'invoice_cancel', new.id,
        jsonb_build_array(
          jsonb_build_object('code', '2210', 'debit', new.tax_amount, 'credit', 0),
          jsonb_build_object('code', v_side, 'debit', 0, 'credit', new.tax_amount)
        ),
        auth.uid());
      perform private.post_entry_branch(v_entry, new.branch_id);
    end if;
    return new;
  end if;

  if new.status <> 'issued' or old.status = 'issued' then
    return new;
  end if;

  if v_scope in ('sale', 'alteration') then
    -- البيع ورسوم التعديل: الفاتورة تُثبت الإيراد والذمة، والدفعات تسدد الذمة
    v_lines := jsonb_build_array(
      jsonb_build_object('code', case v_scope when 'sale' then '1230' else '1240' end,
                         'debit', new.total, 'credit', 0),
      jsonb_build_object('code', case v_scope when 'sale' then '4310' else '4120' end,
                         'debit', 0, 'credit', new.subtotal)
    );
    if new.tax_amount > 0 then
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object('code', '2210', 'debit', 0, 'credit', new.tax_amount));
    end if;
    v_entry := private.post_entry(new.issue_date, 'فاتورة ' || new.invoice_no,
      'invoice', new.id, v_lines, new.created_by);
  elsif new.tax_amount > 0 then
    v_entry := private.post_entry(new.issue_date, 'ضريبة فاتورة ' || new.invoice_no,
      'invoice', new.id,
      jsonb_build_array(
        jsonb_build_object('code', v_side, 'debit', new.tax_amount, 'credit', 0,
                           'memo', 'ضريبة القيمة المضافة من المبلغ المدفوع'),
        jsonb_build_object('code', '2210', 'debit', 0, 'credit', new.tax_amount)
      ),
      new.created_by);
  end if;

  perform private.post_entry_branch(v_entry, new.branch_id);
  return new;
end $$;

create or replace function public.post_payment_entry()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_cash text := '1110';
  v_credit text;
  v_entry uuid;
  v_delivered boolean;
begin
  if new.cash_account_id is not null then
    select gl_code into v_cash from public.cash_accounts where id = new.cash_account_id;
  end if;

  if new.is_security_deposit then
    v_credit := '2120';  -- أمانة للعميلة، ليست دخلًا
  elsif new.scope::text = 'sale' then
    v_credit := '1230';
  elsif new.scope::text = 'alteration' then
    v_credit := '1240';
  elsif new.scope = 'rental' then
    -- قبل تسليم الفستان دفعة مقدمة، وبعده إيراد تأجير
    select delivered_at is not null into v_delivered
      from public.rental_records where id = new.rental_record_id;
    v_credit := case when coalesce(v_delivered, false) then '4210' else '2110' end;
  else
    -- قبل تسليم الطلب دفعة مقدمة، وبعده إيراد تفصيل
    select state = 'delivered' into v_delivered from public.orders where id = new.order_id;
    v_credit := case when coalesce(v_delivered, false) then '4110' else '2110' end;
  end if;

  v_entry := private.post_entry(
    new.paid_at,
    case when new.is_security_deposit then 'سند قبض تأمين ' else 'سند قبض ' end || new.receipt_no,
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

-- فاتورة البيع ورسوم التعديل ما تنلغى من الماليات (السند مربوط فيها)
create or replace function private.guard_sale_invoice_cancel() returns trigger
    language plpgsql
    set search_path to 'public'
    as $$
begin
  if old.status::text = 'issued' and new.status::text <> 'issued' then
    if new.scope::text = 'sale' then
      raise exception 'فاتورة البيع ما تنلغى — سوّ مرتجع من صفحة الفاتورة في المخزون';
    elsif new.scope::text = 'alteration' then
      raise exception 'فاتورة رسوم التعديل ما تنلغى من الماليات';
    end if;
  end if;
  return new;
end $$;

-- ===== 10) صلاحيات افتراضية (تُضاف فقط) =====
insert into public.role_permissions (role_id, permission)
select r.id, p.perm
  from public.roles r
  join (values
    ('supervisor', 'alterations.request'), ('supervisor', 'alterations.approve'),
    ('cs', 'alterations.request'), ('staff', 'alterations.request'),
    ('accountant', 'alterations.workshop')
  ) as p(role_key, perm) on p.role_key = r.key
on conflict (role_id, permission) do nothing;

commit;
