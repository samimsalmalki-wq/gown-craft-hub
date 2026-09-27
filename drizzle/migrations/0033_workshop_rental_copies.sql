-- المعمل هو المخزن الرئيسي: فيه الخامات ونسخ الإيجار والطلبات، وهو مو فرع بيع.
--  • موظفو المعمل (فرعهم في الحساب هو المعمل) يشوفون الطلبات المسندة لهم من كل الفروع.
--  • ما يتسجّل على المعمل طلب ولا سند ولا فاتورة ولا فستان إيجار ولا حجز. المصروفات مسموحة
--    عليه لأنه مركز تكلفة.
--  • تكلفة الخامات المصروفة على طلب تتسجّل على فرع الطلب (مع إيراده)، وتتصحح القيود السابقة.
--  • نسخ الإيجار: لكل نسخة فرع مالك (branch_id) ومكان حالي (location):
--      workshop  في المعمل
--      transit   في الطريق من المعمل (أو من فرع) إلى location_branch_id
--      branch    في الفرع location_branch_id (ومنه تطلع للعميلة وترجع له)
--      returning راجعة من الفرع location_branch_id إلى المعمل
--    تنتقل بشحنات المعمل بقائمة القطع (goods_transfer_lines.rental_dress_id)، والتسليم للعميلة
--    ما يصير إلا والنسخة في فرع الحجز، وبعد إرجاع العميلة ترجع للمعمل تلقائيًا.
--  • المشاركة بين الفروع: كل الفروع تشوف كل النسخ ومواعيد حجزها (rental_busy بدون بيانات
--    العميلات)، وحجز نسخة فرع ثاني يحتاج صلاحية rentals.share، والحجز وماله للفرع اللي حجز.
-- آمن لو انعاد تشغيله. يحجز الجداول أول شي عشان ما يتعارض مع الموقع الشغال.

begin;

set local lock_timeout = '20s';
lock table public.orders, public.payments, public.invoices, public.rental_dresses,
           public.rental_records, public.goods_transfers, public.goods_transfer_lines,
           public.part_issues, public.journal_entries
  in access exclusive mode;

-- ===== 1) مساعد: هل الموقع هو المعمل؟ =====
create or replace function private.is_warehouse(_branch uuid) returns boolean
    language sql stable security definer
    set search_path to 'public'
    as $$
  select coalesce((select b.is_warehouse from public.branches b where b.id = _branch), false)
$$;

revoke all on function private.is_warehouse(uuid) from public;
grant execute on function private.is_warehouse(uuid) to authenticated, service_role;

-- ===== 2) موظفو المعمل يشوفون الطلبات المسندة لهم من كل الفروع =====
create or replace function private.order_visible(_uid uuid, _order uuid, _branch uuid, _created_by uuid)
    returns boolean
    language sql stable security definer
    set search_path to 'public'
    as $$
  select private.is_team(_uid)
     and (private.branch_ok(_uid, _branch) or private.at_warehouse(_uid))
     and (
       private.can(_uid, 'orders.view_all')
       or _created_by = _uid
       or exists (select 1 from public.order_stages s where s.order_id = _order and s.assignee_id = _uid)
     )
$$;

-- ===== 3) المعمل مو فرع بيع =====
create or replace function private.guard_sales_branch() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
begin
  if new.branch_id is not null and private.is_warehouse(new.branch_id) then
    raise exception 'المعمل مو فرع بيع — اختر فرع البيع';
  end if;
  return new;
end $$;

revoke all on function private.guard_sales_branch() from public;

drop trigger if exists orders_sales_branch on public.orders;
create trigger orders_sales_branch before insert or update of branch_id on public.orders
  for each row execute function private.guard_sales_branch();

drop trigger if exists rental_dresses_sales_branch on public.rental_dresses;
create trigger rental_dresses_sales_branch before insert or update of branch_id on public.rental_dresses
  for each row execute function private.guard_sales_branch();

drop trigger if exists rental_records_sales_branch on public.rental_records;
create trigger rental_records_sales_branch before insert or update of branch_id on public.rental_records
  for each row execute function private.guard_sales_branch();

-- السند والفاتورة بدون فرع (أو على المعمل) ياخذون فرع الطلب أو الحجز
create or replace function private.branch_from_link() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_linked uuid;
begin
  if new.branch_id is null or private.is_warehouse(new.branch_id) then
    v_linked := coalesce(
      (select o.branch_id from public.orders o where o.id = new.order_id),
      (select r.branch_id from public.rental_records r where r.id = new.rental_record_id));
    if v_linked is not null then
      new.branch_id := v_linked;
    elsif new.branch_id is not null then
      raise exception 'المعمل مو فرع بيع — اختر فرع البيع';
    end if;
  end if;
  return new;
end $$;

revoke all on function private.branch_from_link() from public;

drop trigger if exists payments_branch_from_link on public.payments;
create trigger payments_branch_from_link before insert or update of branch_id on public.payments
  for each row execute function private.branch_from_link();

drop trigger if exists invoices_branch_from_link on public.invoices;
create trigger invoices_branch_from_link before insert or update of branch_id on public.invoices
  for each row execute function private.branch_from_link();

-- ===== 4) تكلفة الخامات على فرع الطلب =====
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
  -- الخامة المصروفة على طلب تكلفة على فرع الطلب مع إيراده، والباقي على موقع الصرف
  perform private.post_entry_branch(v_entry, coalesce(
    (select o.branch_id from public.orders o where o.id = new.order_id), new.branch_id));
  return new;
end $$;

-- تصحيح القيود السابقة: الفرع المسجّل على القيد فقط، والأرصدة ما تتغير
update public.journal_entries e
   set branch_id = o.branch_id
  from public.material_movements m
  join public.orders o on o.id = m.order_id
 where e.source = 'material_out'
   and e.source_id = m.id
   and o.branch_id is not null
   and e.branch_id is distinct from o.branch_id;

-- ===== 5) مكان نسخة الإيجار =====
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'rental_dresses'
                    and column_name = 'location') then
    alter table public.rental_dresses
      add column location text not null default 'workshop',
      add column location_branch_id uuid references public.branches(id);

    -- النسخ الحالية تبدأ في فرعها، والمدير يصحح مكان اللي موجودة فعليًا في المعمل.
    -- النسخة اللي بدون فرع أو مالكها المعمل (قبل هذا التعديل) تبدأ في المعمل
    update public.rental_dresses d
       set location = case when d.branch_id is null or private.is_warehouse(d.branch_id)
                           then 'workshop' else 'branch' end,
           location_branch_id = case when d.branch_id is null or private.is_warehouse(d.branch_id)
                                     then null else d.branch_id end;

    -- وكل نسخة لها فرع مالك: الفرع الرئيسي بدل المعمل (المعمل مو فرع بيع) أو بدل «بدون فرع»
    update public.rental_dresses d
       set branch_id = (select id from public.branches where is_main limit 1)
     where d.branch_id is null or private.is_warehouse(d.branch_id);
  end if;
end $$;

alter table public.rental_dresses drop constraint if exists rental_dresses_location_check;
alter table public.rental_dresses add constraint rental_dresses_location_check
  check (location in ('workshop', 'transit', 'branch', 'returning')
         and (location = 'workshop') = (location_branch_id is null));

create index if not exists rental_dresses_location_idx
  on public.rental_dresses(location, location_branch_id);

-- المكان يتغيّر بالإرسال والاستلام (دوال النظام) أو بتصحيح المدير (set_rental_copy_place)
create or replace function private.guard_rental_location() returns trigger
    language plpgsql
    set search_path to 'public'
    as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'UPDATE' then
      new.location := old.location;
      new.location_branch_id := old.location_branch_id;
    elsif new.location = 'branch' and not private.can_all_branches(auth.uid()) then
      -- النسخة الجديدة تنحط في المعمل أو في فرعها المالك
      new.location_branch_id := new.branch_id;
    elsif new.location not in ('workshop', 'branch') then
      new.location := 'workshop';
    end if;
  end if;
  if new.location = 'workshop' then
    new.location_branch_id := null;
  elsif new.location_branch_id is null then
    new.location_branch_id := new.branch_id;
  end if;
  return new;
end $$;

revoke all on function private.guard_rental_location() from public;
grant execute on function private.guard_rental_location() to authenticated;

drop trigger if exists rental_dresses_location_guard on public.rental_dresses;
create trigger rental_dresses_location_guard before insert or update on public.rental_dresses
  for each row execute function private.guard_rental_location();

-- كل الفروع تشوف كل النسخ (للمشاركة)، وموظفو المعمل يعدّلون حالة النسخ اللي عندهم
drop policy if exists "dresses readable by team" on public.rental_dresses;
create policy "dresses readable by team" on public.rental_dresses
for select to authenticated
using (private.is_team(auth.uid()));

drop policy if exists "dresses update by managers" on public.rental_dresses;
create policy "dresses update by managers" on public.rental_dresses
for update to authenticated
using (private.can(auth.uid(), 'rentals.manage')
       and (private.branch_ok(auth.uid(), branch_id) or private.at_warehouse(auth.uid())))
with check (private.can(auth.uid(), 'rentals.manage')
       and (private.branch_ok(auth.uid(), branch_id) or private.at_warehouse(auth.uid())));

-- النسخة مع العميلة الحين؟
create or replace function private.rental_copy_out(_dress uuid) returns boolean
    language sql stable security definer
    set search_path to 'public'
    as $$
  select exists (
    select 1 from public.rental_records r
     where r.dress_id = _dress
       and r.delivered_at is not null and r.returned_at is null and r.cancelled_at is null)
$$;

revoke all on function private.rental_copy_out(uuid) from public;
grant execute on function private.rental_copy_out(uuid) to authenticated, service_role;

-- تصحيح مكان النسخة (البداية أو خطأ في التسجيل): للمدير ومن له كل الفروع
create or replace function public.set_rental_copy_place(p_dress_id uuid, p_branch_id uuid default null)
returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  d public.rental_dresses;
begin
  if not private.can_all_branches(auth.uid()) then
    raise exception 'تصحيح مكان النسخة للمدير';
  end if;
  select * into d from public.rental_dresses where id = p_dress_id for update;
  if d.id is null then
    raise exception 'فستان الإيجار غير موجود';
  end if;
  if d.location in ('transit', 'returning') then
    raise exception 'النسخة في الطريق — أكّد استلامها بدل التصحيح';
  end if;
  if private.rental_copy_out(d.id) then
    raise exception 'النسخة مع العميلة — سجّل الإرجاع أول';
  end if;
  if p_branch_id is not null and (private.is_warehouse(p_branch_id)
       or not exists (select 1 from public.branches where id = p_branch_id)) then
    raise exception 'اختر فرع البيع، أو المعمل';
  end if;
  update public.rental_dresses
     set location = case when p_branch_id is null then 'workshop' else 'branch' end,
         location_branch_id = p_branch_id
   where id = d.id;
end $$;

revoke all on function public.set_rental_copy_place(uuid, uuid) from public, anon;
grant execute on function public.set_rental_copy_place(uuid, uuid) to authenticated;

-- ===== 6) نسخ الإيجار في شحنات المعمل =====
alter table public.goods_transfer_lines
  add column if not exists rental_dress_id uuid references public.rental_dresses(id) on delete set null;

-- إرسال نسخة من الفرع للمعمل (بعد الإرجاع، أو نسخة عرض خلصت)
--  _check: القائمة اللي تتأشّر (فاضية = كل قطع النسخة)
create or replace function private.send_copy_to_workshop(
  _dress uuid, _check text[], _sent text[], _note text
) returns uuid
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  d public.rental_dresses;
  v_check text[];
  v_sent text[];
  v_transfer uuid;
  v_line uuid;
  v_title text;
  v_user uuid;
begin
  select * into d from public.rental_dresses where id = _dress for update;
  if d.id is null or d.location <> 'branch' then
    return null;
  end if;
  v_check := case when cardinality(coalesce(_check, '{}')) > 0 then _check
                  else private.parts_or_dress(d.parts) end;
  v_sent := array(select x from unnest(v_check) as x where x = any(coalesce(_sent, '{}')));
  if cardinality(v_sent) = 0 then
    return null;
  end if;
  v_title := 'فستان إيجار ' || d.code || ' (راجع للمعمل)';

  insert into public.goods_transfers
    (transfer_no, from_branch_id, from_workshop, to_branch_id, to_workshop, notes, sent_by)
  values
    ('T-' || lpad(nextval('public.goods_transfer_seq')::text, 5, '0'),
     d.location_branch_id, false, d.location_branch_id, true,
     nullif(btrim(coalesce(_note, '')), ''), auth.uid())
  returning id into v_transfer;

  insert into public.goods_transfer_lines
    (transfer_id, rental_dress_id, qty, title, checklist, sent, position)
  values
    (v_transfer, d.id, 1, v_title, v_check, v_sent, 1)
  returning id into v_line;

  if cardinality(private.text_minus(v_check, v_sent)) > 0 then
    insert into public.part_issues (stage, branch_id, transfer_line_id, title, missing, created_by)
    values ('rental_return', d.location_branch_id, v_line, v_title,
            private.text_minus(v_check, v_sent), auth.uid());
  end if;

  update public.rental_dresses set location = 'returning' where id = d.id;

  -- تنبيه موظفي المعمل اللي يستلمون
  for v_user in
    select p.id from public.profiles p
     where p.is_active
       and p.id is distinct from auth.uid()
       and not private.has_role(p.id, 'admin')
       and private.can(p.id, 'goods.transfer') and private.workshop_ok(p.id)
  loop
    perform private.notify(v_user, null, null, 'task_assigned',
      'فستان إيجار ' || d.code || ' راجع للمعمل — أكّد استلامه');
  end loop;
  return v_transfer;
end $$;

revoke all on function private.send_copy_to_workshop(uuid, text[], text[], text) from public;

create or replace function public.return_rental_copy(
  p_dress_id uuid, p_parts text[], p_note text default null
) returns uuid
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  d public.rental_dresses;
  v_transfer uuid;
begin
  if not (private.can(auth.uid(), 'goods.transfer') or private.can(auth.uid(), 'rentals.manage')) then
    raise exception 'غير مصرح';
  end if;
  select * into d from public.rental_dresses where id = p_dress_id;
  if d.id is null then
    raise exception 'فستان الإيجار غير موجود';
  end if;
  if d.location <> 'branch' then
    raise exception 'النسخة مو موجودة في فرع';
  end if;
  if not private.branch_ok(auth.uid(), d.location_branch_id) then
    raise exception 'غير مصرح لهذا الفرع';
  end if;
  if private.rental_copy_out(d.id) then
    raise exception 'النسخة مع العميلة — سجّل الإرجاع أول';
  end if;
  v_transfer := private.send_copy_to_workshop(d.id, null, p_parts, p_note);
  if v_transfer is null then
    raise exception 'أشّر على القطع المرسلة للمعمل';
  end if;
  return v_transfer;
end $$;

revoke all on function public.return_rental_copy(uuid, text[], text) from public, anon;
grant execute on function public.return_rental_copy(uuid, text[], text) to authenticated;

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
  v_dress public.rental_dresses;
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

    if v_line ? 'dress_id' then
      -- نسخة إيجار: من المعمل، أو من الفرع اللي هي فيه
      select * into v_dress from public.rental_dresses
       where id = (v_line->>'dress_id')::uuid for update;
      if v_dress.id is null then
        raise exception 'فستان الإيجار غير موجود';
      end if;
      if coalesce(p_from_workshop, false) then
        if v_dress.location <> 'workshop' then
          raise exception 'فستان الإيجار % مو موجود في المعمل', v_dress.code;
        end if;
      elsif v_dress.location <> 'branch' or v_dress.location_branch_id is distinct from p_from_branch then
        raise exception 'فستان الإيجار % مو موجود في هذا الفرع', v_dress.code;
      end if;
      if private.rental_copy_out(v_dress.id) then
        raise exception 'فستان الإيجار % مع العميلة', v_dress.code;
      end if;
      v_qty := 1;
      v_check := private.parts_or_dress(v_dress.parts);
      v_title := 'فستان إيجار ' || v_dress.code;
      update public.rental_dresses
         set location = 'transit', location_branch_id = p_to_branch
       where id = v_dress.id;
    elsif v_line ? 'order_id' then
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
      (transfer_id, item_id, order_id, rental_dress_id, qty, title, checklist, sent, position,
       is_count, units)
    values
      (v_transfer, v_item.id, v_order.id, v_dress.id, v_qty, v_title, v_check, v_sent, v_pos,
       v_count, v_units)
    returning id into v_line_id;

    if cardinality(private.text_minus(v_check, v_sent)) > 0 then
      insert into public.part_issues (stage, branch_id, transfer_line_id, order_id, title, missing, created_by)
      values ('send', p_to_branch, v_line_id, v_order.id, v_title, private.text_minus(v_check, v_sent), auth.uid());
    end if;

    v_item := null;
    v_order := null;
    v_dress := null;
  end loop;

  return v_transfer;
end $$;

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
    elsif l.rental_dress_id is not null and l.followup_issue_id is null then
      -- نسخة الإيجار وصلت: للمعمل، أو للفرع المستلم
      if t.to_workshop then
        update public.rental_dresses set location = 'workshop', location_branch_id = null
         where id = l.rental_dress_id and location = 'returning';
      else
        update public.rental_dresses set location = 'branch', location_branch_id = t.to_branch_id
         where id = l.rental_dress_id and location = 'transit';
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

-- ===== 7) الحجز: فرع الحجز، والمشاركة بين الفروع =====

-- مواعيد حجز كل النسخ لكل الفروع (بدون بيانات العميلات والمبالغ): للتقويم والبحث بالتاريخ
create or replace function public.rental_busy()
returns table (
  record_id uuid,
  dress_id uuid,
  branch_id uuid,
  out_date date,
  due_date date,
  fitting_date date,
  delivered boolean
)
    language sql stable security definer
    set search_path to 'public'
    as $$
  select r.id, r.dress_id, r.branch_id, r.out_date, r.due_date, r.fitting_date,
         r.delivered_at is not null
    from public.rental_records r
   where private.is_team(auth.uid())
     and r.returned_at is null
     and r.cancelled_at is null
   order by r.out_date
$$;

revoke all on function public.rental_busy() from public, anon;
grant execute on function public.rental_busy() to authenticated;

-- حجز متداخل على نفس النسخة: من فرع ثاني تظهر باسم الفرع بدل اسم العميلة
create or replace function public.check_rental_overlap()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_conflict record;
begin
  if new.returned_at is not null or new.cancelled_at is not null then
    return new;
  end if;
  if new.due_date < new.out_date then
    raise exception 'تاريخ الإرجاع لا يمكن أن يكون قبل تاريخ الخروج';
  end if;

  select r.out_date, r.due_date, r.client_name, r.branch_id into v_conflict
    from public.rental_records r
   where r.dress_id = new.dress_id
     and r.id <> new.id
     and r.returned_at is null
     and r.cancelled_at is null
     and r.out_date <= new.due_date
     and r.due_date >= new.out_date
   limit 1;

  if found then
    if v_conflict.branch_id is distinct from new.branch_id then
      raise exception 'الفستان محجوز من % إلى % لفرع %', v_conflict.out_date, v_conflict.due_date,
        coalesce((select name from public.branches where id = v_conflict.branch_id), '—');
    end if;
    raise exception 'الفستان محجوز من % إلى % (%)', v_conflict.out_date, v_conflict.due_date, v_conflict.client_name;
  end if;
  return new;
end $function$;

drop function if exists public.book_rental(uuid, text, text, date, date, numeric, numeric, text, numeric, public.payment_method, text, date);

create or replace function public.book_rental(
  p_dress_id uuid,
  p_client_name text,
  p_client_phone text,
  p_out_date date,
  p_due_date date,
  p_amount numeric,
  p_deposit_amount numeric,
  p_notes text default null,
  p_paid numeric default 0,
  p_method public.payment_method default 'cash',
  p_invoice_no text default null,
  p_fitting_date date default null,
  p_branch_id uuid default null
) returns uuid
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_owner uuid;
  v_branch uuid;
  v_code text;
  v_rec uuid;
  v_invoice text := nullif(btrim(coalesce(p_invoice_no, '')), '');
begin
  if not private.can(auth.uid(), 'rentals.manage') then
    raise exception 'غير مصرح';
  end if;
  select branch_id, code into v_owner, v_code from public.rental_dresses where id = p_dress_id;
  if v_code is null then
    raise exception 'الفستان غير موجود';
  end if;
  -- فرع الحجز: اللي يسجّل الحجز وياخذ ماله، والنسخة تبقى ملك فرعها
  v_branch := coalesce(p_branch_id, v_owner);
  if v_branch is null or private.is_warehouse(v_branch) then
    raise exception 'اختر فرع الحجز';
  end if;
  if not private.branch_ok(auth.uid(), v_branch) then
    raise exception 'غير مصرح لهذا الفرع';
  end if;
  if v_branch is distinct from v_owner and not private.can(auth.uid(), 'rentals.share') then
    raise exception 'هذي النسخة تابعة لفرع ثاني — حجزها يحتاج صلاحية «حجز نسخ الفروع الأخرى»';
  end if;
  if coalesce(btrim(p_client_name), '') = '' then
    raise exception 'اكتب اسم العميلة';
  end if;
  if coalesce(p_amount, 0) < 0 or coalesce(p_deposit_amount, 0) < 0 or coalesce(p_paid, 0) < 0 then
    raise exception 'المبالغ لا تكون سالبة';
  end if;
  if coalesce(p_paid, 0) > coalesce(p_amount, 0) then
    raise exception 'العربون أكبر من قيمة الإيجار';
  end if;
  if p_fitting_date is not null and p_fitting_date > p_out_date then
    raise exception 'موعد البروفة لازم يكون قبل موعد الخروج أو في نفس اليوم';
  end if;

  insert into public.rental_records
    (dress_id, client_name, client_phone, out_date, due_date, amount, deposit_amount, notes,
     branch_id, created_by, tracks_money, external_invoice_no, fitting_date)
  values
    (p_dress_id, btrim(p_client_name), nullif(btrim(coalesce(p_client_phone, '')), ''), p_out_date,
     p_due_date, coalesce(p_amount, 0), coalesce(p_deposit_amount, 0), nullif(btrim(coalesce(p_notes, '')), ''),
     v_branch, auth.uid(), true, v_invoice, p_fitting_date)
  returning id into v_rec;

  if coalesce(p_paid, 0) > 0 then
    insert into public.payments
      (scope, rental_record_id, amount, method, paid_at, notes, cash_account_id, branch_id, created_by, is_deposit)
    values
      ('rental', v_rec, p_paid, p_method, current_date,
       'عربون حجز فستان ' || v_code || coalesce(' — فاتورة ' || v_invoice, ''),
       private.method_box(v_branch, p_method), v_branch, auth.uid(), true);
  end if;

  return v_rec;
end $$;

revoke all on function public.book_rental(uuid, text, text, date, date, numeric, numeric, text, numeric, public.payment_method, text, date, uuid) from public, anon;
grant execute on function public.book_rental(uuid, text, text, date, date, numeric, numeric, text, numeric, public.payment_method, text, date, uuid) to authenticated;

-- التسليم للعميلة: النسخة لازم تكون في فرع الحجز
create or replace function public.deliver_rental(
  p_record_id uuid,
  p_rent_paid numeric default 0,
  p_rent_method public.payment_method default 'cash',
  p_deposit_paid numeric default 0,
  p_deposit_method public.payment_method default 'cash'
) returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  r public.rental_records;
  d public.rental_dresses;
  v_code text;
  v_paid numeric;
  v_entry uuid;
begin
  if not private.can(auth.uid(), 'rentals.manage') then
    raise exception 'غير مصرح';
  end if;
  select * into r from public.rental_records where id = p_record_id for update;
  if r.id is null then
    raise exception 'الحجز غير موجود';
  end if;
  if not private.branch_ok(auth.uid(), r.branch_id) then
    raise exception 'غير مصرح';
  end if;
  if r.cancelled_at is not null then
    raise exception 'هذا الحجز ملغي';
  end if;
  if r.delivered_at is not null or r.returned_at is not null then
    raise exception 'الفستان مسلَّم للعميلة مسبقًا';
  end if;
  if r.cancel_requested_at is not null then
    raise exception 'على هذا الحجز طلب إلغاء بانتظار قرار المدير';
  end if;
  if coalesce(p_rent_paid, 0) < 0 or coalesce(p_deposit_paid, 0) < 0 then
    raise exception 'المبالغ لا تكون سالبة';
  end if;
  select * into d from public.rental_dresses where id = r.dress_id;
  v_code := d.code;
  if d.location <> 'branch' or d.location_branch_id is distinct from r.branch_id then
    raise exception 'الفستان مو موجود في الفرع — %', case d.location
      when 'workshop' then 'المعمل يرسله أول، والفرع يأكّد الاستلام'
      when 'transit' then 'في الطريق، أكّد استلامه أول'
      when 'returning' then 'راجع للمعمل'
      else 'موجود في فرع ثاني' end;
  end if;

  if r.tracks_money then
    if coalesce(p_rent_paid, 0) > greatest(r.amount - r.paid_amount, 0) then
      raise exception 'المبلغ أكبر من المتبقي من الإيجار';
    end if;

    if coalesce(p_rent_paid, 0) > 0 then
      insert into public.payments
        (scope, rental_record_id, amount, method, paid_at, notes, cash_account_id, branch_id, created_by)
      values
        ('rental', r.id, p_rent_paid, p_rent_method, current_date, 'باقي إيجار فستان ' || v_code,
         private.method_box(r.branch_id, p_rent_method), r.branch_id, auth.uid());
    end if;

    if coalesce(p_deposit_paid, 0) > 0 then
      insert into public.payments
        (scope, rental_record_id, amount, method, paid_at, notes, cash_account_id, branch_id,
         created_by, is_security_deposit)
      values
        ('rental', r.id, p_deposit_paid, p_deposit_method, current_date, 'تأمين فستان ' || v_code,
         private.deposit_box(r.branch_id), r.branch_id, auth.uid(), true);
    end if;

    -- العربون وباقي الإيجار يتحولان من دفعات مقدمة إلى إيراد تأجير عند التسليم
    select coalesce(sum(amount), 0) into v_paid
      from public.payments where rental_record_id = r.id and not is_security_deposit;
    if v_paid > 0 then
      v_entry := private.post_entry(current_date,
        'إثبات إيراد تأجير فستان ' || v_code || ' عند التسليم — ' || r.client_name,
        'rental_delivered', r.id,
        jsonb_build_array(
          jsonb_build_object('code', '2110', 'debit', v_paid, 'credit', 0),
          jsonb_build_object('code', '4210', 'debit', 0, 'credit', v_paid)
        ),
        auth.uid());
      perform private.post_entry_branch(v_entry, r.branch_id);
    end if;
  end if;

  update public.rental_records
     set delivered_at = now(),
         delivered_by = auth.uid(),
         deposit_method = case when coalesce(p_deposit_paid, 0) > 0 then p_deposit_method else deposit_method end
   where id = r.id;
end $$;

-- الإرجاع: قائمة القطع اللي رجعت، ثم ترجع النسخة للمعمل تلقائيًا
drop function if exists public.close_rental_return(uuid, text, numeric, text, public.payment_method);

create or replace function public.close_rental_return(
  p_record_id uuid,
  p_condition text default 'available',
  p_damage numeric default 0,
  p_note text default null,
  p_method public.payment_method default null,
  p_parts text[] default null
) returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  r public.rental_records;
  d public.rental_dresses;
  v_code text;
  v_held numeric;
  v_damage numeric;
  v_refund numeric;
  v_method public.payment_method;
  v_box uuid;
  v_shop uuid;
  v_lines jsonb;
  v_entry uuid;
  v_check text[];
  v_given text[];
begin
  if not private.can(auth.uid(), 'rentals.manage') then
    raise exception 'غير مصرح';
  end if;
  select * into r from public.rental_records where id = p_record_id for update;
  if r.id is null then
    raise exception 'العقد غير موجود';
  end if;
  if not private.branch_ok(auth.uid(), r.branch_id) then
    raise exception 'غير مصرح';
  end if;
  if r.returned_at is not null then
    raise exception 'العقد مُرجَع مسبقًا';
  end if;
  if r.cancelled_at is not null then
    raise exception 'هذا الحجز ملغي';
  end if;
  if r.delivered_at is null then
    raise exception 'الفستان ما تسلّم للعميلة بعد';
  end if;
  select * into d from public.rental_dresses where id = r.dress_id;
  v_code := d.code;

  -- القطع اللي رجعت (اللي يرجع هو اللي خرج)
  if p_parts is not null then
    v_check := case when r.out_parts is not null then r.out_parts else private.parts_or_dress(d.parts) end;
    v_given := array(select x from unnest(v_check) as x where x = any(p_parts));
    if cardinality(v_given) = 0 then
      raise exception 'أشّر على القطع اللي رجعت';
    end if;
  end if;

  v_held := greatest(r.deposit_paid - r.deposit_refunded - r.damage_amount, 0);
  v_damage := least(greatest(coalesce(p_damage, 0), 0), v_held);
  v_refund := v_held - v_damage;
  v_method := coalesce(p_method, r.deposit_method, 'cash');

  update public.rental_records
     set returned_at = now(),
         return_condition = coalesce(nullif(btrim(coalesce(p_condition, '')), ''), 'available'),
         damage_amount = r.damage_amount + v_damage,
         deposit_refunded = r.deposit_refunded + v_refund,
         return_parts = coalesce(v_given, return_parts),
         notes = case
           when nullif(btrim(coalesce(p_note, '')), '') is null then notes
           else concat_ws(E'\n', notes, 'عند الإرجاع: ' || btrim(p_note)) end
   where id = r.id;

  if v_given is not null and cardinality(private.text_minus(v_check, v_given)) > 0 then
    insert into public.part_issues (stage, branch_id, rental_record_id, order_id, title, missing, created_by)
    values ('rental_return', r.branch_id, r.id, r.order_id,
            'فستان إيجار ' || coalesce(v_code, '') || ' — ' || r.client_name,
            private.text_minus(v_check, v_given), auth.uid());
  end if;

  if v_held > 0 then
    v_box := private.deposit_box(r.branch_id);
    if v_refund > 0 then
      perform private.issue_voucher('deposit_refund', r.id, v_refund, v_method, v_box, r.branch_id,
        'رد تأمين فستان ' || v_code || ' — ' || r.client_name, auth.uid());
    end if;

    v_lines := jsonb_build_array(
      jsonb_build_object('code', '2120', 'debit', v_held, 'credit', 0, 'memo', 'تأمين العميلة ' || r.client_name),
      jsonb_build_object('code', private.box_gl(v_box), 'debit', 0, 'credit', v_held, 'memo', 'خروج التأمين من صندوق التأمينات')
    );

    -- خصم التلف يخرج من صندوق التأمينات إلى صندوق الفرع ويُسجَّل إيرادًا
    if v_damage > 0 then
      v_shop := private.method_box(r.branch_id, v_method);
      insert into public.cash_transactions
        (account_id, direction, amount, occurred_at, source, source_id, description, created_by, method)
      values (v_box, 'out', v_damage, current_date, 'rental_damage', r.id,
              'خصم تلف من تأمين فستان ' || v_code || ' — ' || r.client_name, auth.uid(), v_method);
      if v_shop is not null then
        insert into public.cash_transactions
          (account_id, direction, amount, occurred_at, source, source_id, description, created_by, method)
        values (v_shop, 'in', v_damage, current_date, 'rental_damage', r.id,
                'خصم تلف من تأمين فستان ' || v_code || ' — ' || r.client_name, auth.uid(), v_method);
      end if;
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object('code', private.box_gl(v_shop), 'debit', v_damage, 'credit', 0, 'memo', 'خصم تلف محوّل لصندوق الفرع'),
        jsonb_build_object('code', '4220', 'debit', 0, 'credit', v_damage, 'memo', 'إيراد تلف وتنظيف')
      );
    end if;

    v_entry := private.post_entry(current_date,
      'إرجاع فستان ' || v_code || ' — ' || r.client_name,
      'rental_return', r.id, v_lines, auth.uid());
    perform private.post_entry_branch(v_entry, r.branch_id);
  end if;

  if r.order_id is not null then
    perform private.log_activity(r.order_id, null, 'rental_returned',
      case when v_damage > 0 then 'أُرجع الفستان بخصم تلف' else 'أُرجع الفستان سليمًا' end);
  end if;

  -- النسخة ترجع للمعمل دائمًا بعد الإرجاع، بالقطع اللي رجعت
  if v_given is not null then
    perform private.send_copy_to_workshop(d.id, v_given, v_given,
      'راجع من العميلة ' || r.client_name);
  end if;
end $$;

revoke all on function public.close_rental_return(uuid, text, numeric, text, public.payment_method, text[]) from public, anon;
grant execute on function public.close_rental_return(uuid, text, numeric, text, public.payment_method, text[]) to authenticated;

-- فستان طلب الإيجار يدخل المخزون ومكانه حسب مكان فستان الطلب
create or replace function public.deliver_rental_order(
  p_order_id uuid,
  p_due_date date default null,
  p_deposit_paid numeric default null,
  p_deposit_method public.payment_method default 'cash'
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_order public.orders;
  v_dress uuid;
  v_branch uuid;
  v_code text;
  v_rec uuid;
  v_deposit numeric;
  v_at_branch boolean;
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
  if coalesce(p_deposit_paid, 0) < 0 then
    raise exception 'المبالغ لا تكون سالبة';
  end if;

  select id into v_dress from public.rental_dresses where source_order_id = p_order_id limit 1;

  v_branch := coalesce(v_order.branch_id, (select id from public.branches where is_main limit 1));
  v_code := 'R-' || v_order.order_no;
  -- تفصيل الإيجار يتسلّم للعميلة من الفرع، والإنتاج للإيجار يدخل المخزون من مكان الفستان
  v_at_branch := v_order.order_kind = 'rental'
                 or v_order.dress_location in ('transit', 'branch', 'fitting', 'delivered');

  if v_dress is null then
    insert into public.rental_dresses (
      code, model_no, size, color, rent_price, deposit_amount, status,
      notes, branch_id, source_order_id, created_by, location, location_branch_id
    ) values (
      v_code,
      v_order.model_no,
      null,
      null,
      v_order.total_amount,
      v_order.security_deposit,
      'available',
      'أُنتج بطلب ' || v_order.order_no,
      v_branch,
      p_order_id,
      auth.uid(),
      case when v_at_branch then 'branch' else 'workshop' end,
      case when v_at_branch then v_branch end
    ) returning id into v_dress;
  end if;

  if v_order.order_kind = 'rental'
     and not exists (select 1 from public.rental_records where order_id = p_order_id) then
    insert into public.rental_records (
      dress_id, order_id, client_name, client_phone, out_date, due_date,
      amount, deposit_amount, notes, branch_id, created_by, delivered_at, delivered_by
    ) values (
      v_dress, p_order_id, v_order.client_name, v_order.client_phone,
      current_date, coalesce(p_due_date, current_date + 7),
      v_order.total_amount, v_order.security_deposit,
      'تسليم طلب تفصيل إيجار ' || v_order.order_no,
      v_branch, auth.uid(), now(), auth.uid()
    ) returning id into v_rec;

    -- الإيجار نفسه مسجّل على الطلب، والتأمين أمانة في صندوق التأمينات
    v_deposit := coalesce(p_deposit_paid, v_order.security_deposit, 0);
    if v_deposit > 0 then
      insert into public.payments
        (scope, rental_record_id, amount, method, paid_at, notes, cash_account_id, branch_id,
         created_by, is_security_deposit)
      values
        ('rental', v_rec, v_deposit, p_deposit_method, current_date,
         'تأمين فستان ' || v_code || ' — طلب ' || v_order.order_no,
         private.deposit_box(v_branch), v_branch, auth.uid(), true);
      update public.rental_records set deposit_method = p_deposit_method where id = v_rec;
    end if;
  end if;

  update public.orders
     set state = 'delivered'
   where id = p_order_id and state <> 'delivered';

  perform private.log_activity(p_order_id, null, 'rental_stock_in',
    'دخول الفستان مخزون الإيجار بكود ' || v_code);

  return v_dress;
end $$;

commit;
