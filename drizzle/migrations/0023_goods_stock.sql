-- المخزون الجاهز (بضاعة: فساتين، طرح، إكسسوارات…) مع المعمل والفروع:
--  • كل كمية تابعة لفرع، وتكون إما في المعمل (جاهزة لذلك الفرع) أو في مخزن الفرع نفسه.
--  • الصنف له غرض (للبيع / للعرض / عينة) وخيار «قابل للبيع»، وقائمة قطع (الفستان، الطرحة، الجيبون…).
--  • الشحنات: المعمل (أو فرع) يرسل بقائمة تأشير للقطع، والفرع يأشّر اللي وصله ويأكد الاستلام.
--    ما لم يُرسل أو لم يصل أو لم يُسلَّم للعميلة يُسجَّل «نواقص» للمتابعة.
--  • طلبات العميلات: عند وصول الطلب لمرحلة «التسليم» يدخل «جاهز المعمل» تلقائيًا،
--    ويُرسل للفرع، ويُسلَّم للعميلة بقائمة تأشير.
--  • البيع: فاتورة ضريبية (السعر شامل الضريبة) + سند قبض في صندوق الفرع حسب طريقة الدفع،
--    والقيد: مدين مدينو المبيعات 1230 / دائن إيراد البضاعة 4310 والضريبة 2210، ثم القبض يسدد 1230.
-- ملاحظة: القيمة الجديدة 'sale' لا تُستخدم كقيمة ثابتة خارج الدوال في هذا الملف
-- (تُقارن كنص scope::text) لأن قيمة الـ enum الجديدة لا تُستعمل قبل انتهاء نفس المعاملة.

-- ===== 1) نوع مالي جديد وحساباته =====
alter type public.finance_scope add value if not exists 'sale';

insert into public.gl_accounts (code, name, type, parent_id) values
  ('1230', 'مدينون — مبيعات البضاعة', 'asset', (select id from public.gl_accounts where code = '1000')),
  ('4310', 'إيرادات بيع البضاعة', 'revenue', (select id from public.gl_accounts where code = '4000'))
on conflict (code) do nothing;

-- ===== 2) دوال مساعدة =====
-- موظفو المستودع الرئيسي (المعمل) يرون جاهز المعمل لكل الفروع
create or replace function private.at_warehouse(_uid uuid) returns boolean
    language sql stable security definer
    set search_path to 'public'
    as $$
  select coalesce((
    select b.is_warehouse
      from public.profiles p
      join public.branches b on b.id = p.branch_id
     where p.id = _uid
  ), false)
$$;

-- رؤية كمية أو شحنة: فرع المستخدم (أو كل الفروع)، وجاهز المعمل لموظفي المستودع
create or replace function private.goods_place_ok(_uid uuid, _branch uuid, _at_workshop boolean)
    returns boolean
    language sql stable security definer
    set search_path to 'public'
    as $$
  select private.branch_ok(_uid, _branch) or (_at_workshop and private.at_warehouse(_uid))
$$;

revoke all on function private.at_warehouse(uuid) from public;
revoke all on function private.goods_place_ok(uuid, uuid, boolean) from public;
grant execute on function private.at_warehouse(uuid) to authenticated, service_role;
grant execute on function private.goods_place_ok(uuid, uuid, boolean) to authenticated, service_role;

-- قائمة القطع الفعلية (الفارغة تعني الفستان وحده)
create or replace function private.parts_or_dress(_parts text[]) returns text[]
    language sql immutable
    as $$
  select case when cardinality(coalesce(_parts, '{}')) = 0 then array['الفستان'] else _parts end
$$;

-- عناصر القائمة الأولى غير الموجودة في الثانية (بنفس الترتيب)
create or replace function private.text_minus(_a text[], _b text[]) returns text[]
    language sql immutable
    as $$
  select coalesce(array_agg(x order by i), '{}')
    from unnest(coalesce(_a, '{}')) with ordinality as t(x, i)
   where not (x = any(coalesce(_b, '{}')))
$$;

-- ===== 3) الأصناف =====
create sequence if not exists public.goods_item_seq;

create table if not exists public.goods_items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  item_type_id uuid references public.item_types(id),
  purpose text not null default 'sale' check (purpose in ('sale', 'display', 'sample')),
  sellable boolean not null default true,
  -- سعر البيع المفترض للقطعة شامل الضريبة
  price numeric(12,2) not null default 0 check (price >= 0),
  size text,
  color text,
  parts text[] not null default '{}',
  image_path text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goods_items_sale_is_sellable check (purpose <> 'sale' or sellable)
);

create or replace function public.set_goods_item_code() returns trigger
    language plpgsql
    set search_path to 'public'
    as $$
begin
  new.code := nullif(btrim(coalesce(new.code, '')), '');
  if new.code is null then
    new.code := 'G-' || lpad(nextval('public.goods_item_seq')::text, 4, '0');
  end if;
  new.name := btrim(new.name);
  if new.purpose = 'sale' then
    new.sellable := true;
  end if;
  return new;
end $$;

drop trigger if exists goods_items_code on public.goods_items;
create trigger goods_items_code before insert or update of code, name, purpose, sellable on public.goods_items
  for each row execute function public.set_goods_item_code();

drop trigger if exists goods_items_touch on public.goods_items;
create trigger goods_items_touch before update on public.goods_items
  for each row execute function public.touch_updated_at();

grant select, insert, update on public.goods_items to authenticated;
grant all on public.goods_items to service_role;
grant usage on sequence public.goods_item_seq to authenticated, service_role;
alter table public.goods_items enable row level security;

drop policy if exists "goods items readable by team" on public.goods_items;
create policy "goods items readable by team" on public.goods_items
for select to authenticated using (private.is_team(auth.uid()));

drop policy if exists "goods items insert by managers" on public.goods_items;
create policy "goods items insert by managers" on public.goods_items
for insert to authenticated with check (private.can(auth.uid(), 'goods.manage'));

drop policy if exists "goods items update by managers" on public.goods_items;
create policy "goods items update by managers" on public.goods_items
for update to authenticated
using (private.can(auth.uid(), 'goods.manage'))
with check (private.can(auth.uid(), 'goods.manage'));

-- ===== 4) الكميات والحركات =====
create table if not exists public.goods_stock (
  item_id uuid not null references public.goods_items(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  at_workshop boolean not null default false,
  qty integer not null default 0 check (qty >= 0),
  updated_at timestamptz not null default now(),
  primary key (item_id, branch_id, at_workshop)
);

create index if not exists goods_stock_branch_idx on public.goods_stock(branch_id, at_workshop);

create table if not exists public.goods_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.goods_items(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  at_workshop boolean not null default false,
  qty integer not null,
  kind text not null check (kind in ('in', 'adjust', 'send', 'receive', 'sale')),
  transfer_id uuid,
  invoice_id uuid references public.invoices(id) on delete set null,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists goods_movements_item_idx on public.goods_movements(item_id, created_at desc);

grant select on public.goods_stock to authenticated;
grant select on public.goods_movements to authenticated;
grant all on public.goods_stock to service_role;
grant all on public.goods_movements to service_role;
alter table public.goods_stock enable row level security;
alter table public.goods_movements enable row level security;

drop policy if exists "goods stock readable" on public.goods_stock;
create policy "goods stock readable" on public.goods_stock
for select to authenticated
using (private.is_team(auth.uid()) and private.goods_place_ok(auth.uid(), branch_id, at_workshop));

drop policy if exists "goods movements readable" on public.goods_movements;
create policy "goods movements readable" on public.goods_movements
for select to authenticated
using (private.is_team(auth.uid()) and private.goods_place_ok(auth.uid(), branch_id, at_workshop));

-- ===== 5) الطلبات: قطع الفستان ومكانه =====
alter table public.orders
  add column if not exists parts text[] not null default '{}',
  add column if not exists dress_location text not null default 'production',
  add column if not exists delivered_parts text[];

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_dress_location_check') then
    alter table public.orders add constraint orders_dress_location_check
      check (dress_location in ('production', 'workshop', 'transit', 'branch', 'delivered'));
  end if;
end $$;

-- الطلبات الحالية: المسلَّمة مسلَّمة، واللي وصلت مرحلة التسليم تُعتبر في الفرع
update public.orders set dress_location = 'delivered'
 where state = 'delivered' and dress_location = 'production';
update public.orders set dress_location = 'branch'
 where state = 'active' and current_stage::text = 'delivery' and dress_location = 'production';

-- وصول الطلب لمرحلة «التسليم» = خلص الإنتاج، فيدخل جاهز المعمل
-- (الاسم يجعل المشغّل يعمل بعد orders_guard_columns)
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
        and new.current_stage::text = 'delivery'
        and old.current_stage::text is distinct from 'delivery'
        and new.dress_location = 'production' then
    new.dress_location := 'workshop';
  end if;
  return new;
end $$;

revoke all on function private.track_dress_location() from public;
grant execute on function private.track_dress_location() to authenticated;

drop trigger if exists orders_track_dress_location on public.orders;
create trigger orders_track_dress_location
  before update of current_stage, state on public.orders
  for each row execute function private.track_dress_location();

-- الطلبات الجاهزة (في المعمل أو الطريق أو الفرع) لمن يستلم ويرسل، بدون فتح كل بيانات الطلب
create or replace function public.ready_orders()
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
  dress_location text
)
    language sql stable security definer
    set search_path to 'public'
    as $$
  select o.id, o.order_no, o.client_name, o.client_phone, o.branch_id, o.order_kind,
         o.event_date, o.due_date, o.parts, o.dress_location
    from public.orders o
   where o.state = 'active'
     and o.dress_location in ('workshop', 'transit', 'branch')
     and (private.can(auth.uid(), 'goods.transfer') or private.can(auth.uid(), 'orders.view_all'))
     and private.goods_place_ok(auth.uid(), o.branch_id, o.dress_location = 'workshop')
   order by o.due_date nulls last, o.order_no
$$;

revoke all on function public.ready_orders() from public, anon;
grant execute on function public.ready_orders() to authenticated;

-- ===== 6) الشحنات =====
create sequence if not exists public.goods_transfer_seq;

create table if not exists public.goods_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_no text not null unique,
  from_branch_id uuid not null references public.branches(id),
  from_workshop boolean not null default false,
  to_branch_id uuid not null references public.branches(id),
  status text not null default 'in_transit' check (status in ('in_transit', 'received')),
  notes text,
  sent_by uuid references public.profiles(id),
  sent_at timestamptz not null default now(),
  received_by uuid references public.profiles(id),
  received_at timestamptz
);

create table if not exists public.goods_transfer_lines (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.goods_transfers(id) on delete cascade,
  item_id uuid references public.goods_items(id),
  order_id uuid references public.orders(id) on delete set null,
  qty integer not null default 1 check (qty > 0),
  title text not null,
  -- القطع المتوقعة، واللي انرسلت، واللي وصلت (فارغة لين الاستلام)
  checklist text[] not null default '{}',
  sent text[] not null default '{}',
  received text[],
  position integer not null default 1
);

create index if not exists goods_transfers_to_idx on public.goods_transfers(to_branch_id, status);
create index if not exists goods_transfer_lines_transfer_idx on public.goods_transfer_lines(transfer_id);

grant select on public.goods_transfers to authenticated;
grant select on public.goods_transfer_lines to authenticated;
grant all on public.goods_transfers to service_role;
grant all on public.goods_transfer_lines to service_role;
alter table public.goods_transfers enable row level security;
alter table public.goods_transfer_lines enable row level security;

drop policy if exists "goods transfers readable" on public.goods_transfers;
create policy "goods transfers readable" on public.goods_transfers
for select to authenticated
using (
  private.is_team(auth.uid())
  and (private.branch_ok(auth.uid(), to_branch_id)
       or private.goods_place_ok(auth.uid(), from_branch_id, from_workshop))
);

drop policy if exists "goods transfer lines readable" on public.goods_transfer_lines;
create policy "goods transfer lines readable" on public.goods_transfer_lines
for select to authenticated
using (exists (
  select 1 from public.goods_transfers t
   where t.id = transfer_id
     and private.is_team(auth.uid())
     and (private.branch_ok(auth.uid(), t.to_branch_id)
          or private.goods_place_ok(auth.uid(), t.from_branch_id, t.from_workshop))
));

-- ===== 7) النواقص =====
create table if not exists public.part_issues (
  id uuid primary key default gen_random_uuid(),
  stage text not null check (stage in ('send', 'receive', 'deliver')),
  branch_id uuid references public.branches(id),
  transfer_line_id uuid references public.goods_transfer_lines(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  title text not null,
  missing text[] not null,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  resolution text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists part_issues_open_idx on public.part_issues(branch_id) where resolved_at is null;

grant select on public.part_issues to authenticated;
grant all on public.part_issues to service_role;
alter table public.part_issues enable row level security;

drop policy if exists "part issues readable" on public.part_issues;
create policy "part issues readable" on public.part_issues
for select to authenticated
using (private.is_team(auth.uid())
       and (private.branch_ok(auth.uid(), branch_id) or private.at_warehouse(auth.uid())));

-- ===== 8) تعديل الكميات (إدخال أو تسوية) =====
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
  if not private.goods_place_ok(auth.uid(), p_branch_id, coalesce(p_at_workshop, false)) then
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

revoke all on function public.goods_adjust(uuid, uuid, boolean, integer, text) from public, anon;
grant execute on function public.goods_adjust(uuid, uuid, boolean, integer, text) to authenticated;

-- ===== 9) إرسال شحنة =====
-- p_lines: [{"item_id": uuid, "qty": 2, "sent": ["…"]} | {"order_id": uuid, "sent": ["…"]}]
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
  v_sent text[];
  v_title text;
  v_line_id uuid;
begin
  if not private.can(auth.uid(), 'goods.transfer') then
    raise exception 'غير مصرح';
  end if;
  if not private.goods_place_ok(auth.uid(), p_from_branch, coalesce(p_from_workshop, false)) then
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
      v_check := case when cardinality(v_item.parts) > 0 then v_item.parts
                      else array[v_item.name || ' × ' || v_qty] end;
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

    -- القطع المرسلة من ضمن القائمة فقط
    v_sent := array(select x from unnest(v_check) as x where x = any(v_sent));
    if cardinality(v_sent) = 0 then
      raise exception 'أشّر على القطع المرسلة من «%»', v_title;
    end if;

    insert into public.goods_transfer_lines
      (transfer_id, item_id, order_id, qty, title, checklist, sent, position)
    values
      (v_transfer, v_item.id, v_order.id, v_qty, v_title, v_check, v_sent, v_pos)
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

revoke all on function public.send_goods(uuid, boolean, uuid, jsonb, text) from public, anon;
grant execute on function public.send_goods(uuid, boolean, uuid, jsonb, text) to authenticated;

-- ===== 10) استلام شحنة =====
-- p_lines: [{"line_id": uuid, "received": ["…"]}]
create or replace function public.receive_goods(p_transfer_id uuid, p_lines jsonb) returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  t public.goods_transfers;
  l public.goods_transfer_lines;
  v_got text[];
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
    select coalesce(array(select jsonb_array_elements_text(x->'received')), '{}') into v_got
      from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) as x
     where (x->>'line_id')::uuid = l.id
     limit 1;
    v_got := array(select s from unnest(l.sent) as s where s = any(coalesce(v_got, '{}')));

    update public.goods_transfer_lines set received = v_got where id = l.id;

    if l.item_id is not null then
      -- الصنف يدخل مخزن الفرع إذا وصلت قطعته الأساسية
      if l.checklist[1] = any(v_got) then
        insert into public.goods_stock (item_id, branch_id, at_workshop, qty)
        values (l.item_id, t.to_branch_id, false, l.qty)
        on conflict (item_id, branch_id, at_workshop)
        do update set qty = public.goods_stock.qty + excluded.qty, updated_at = now();
        insert into public.goods_movements
          (item_id, branch_id, at_workshop, qty, kind, transfer_id, notes, created_by)
        values
          (l.item_id, t.to_branch_id, false, l.qty, 'receive', t.id, 'استلام من ' || v_from, auth.uid());
      end if;
    elsif l.order_id is not null then
      update public.orders set dress_location = 'branch'
       where id = l.order_id and dress_location = 'transit';
      perform private.log_activity(l.order_id, null, 'dress_received',
        'استلم الفرع الفستان: ' || array_to_string(v_got, '، '));
    end if;

    if cardinality(private.text_minus(l.sent, v_got)) > 0 then
      insert into public.part_issues (stage, branch_id, transfer_line_id, order_id, title, missing, created_by)
      values ('receive', t.to_branch_id, l.id, l.order_id, l.title, private.text_minus(l.sent, v_got), auth.uid());
    end if;
  end loop;

  update public.goods_transfers
     set status = 'received', received_by = auth.uid(), received_at = now()
   where id = t.id;
end $$;

revoke all on function public.receive_goods(uuid, jsonb) from public, anon;
grant execute on function public.receive_goods(uuid, jsonb) to authenticated;

-- ===== 11) متابعة النواقص =====
create or replace function public.resolve_part_issue(p_issue_id uuid, p_note text default null) returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_branch uuid;
begin
  if not (private.can(auth.uid(), 'goods.transfer') or private.can(auth.uid(), 'orders.edit')) then
    raise exception 'غير مصرح';
  end if;
  select branch_id into v_branch from public.part_issues where id = p_issue_id and resolved_at is null;
  if not found then
    raise exception 'النقص غير موجود أو تمت متابعته';
  end if;
  if not (private.branch_ok(auth.uid(), v_branch) or private.at_warehouse(auth.uid())) then
    raise exception 'غير مصرح لهذا الفرع';
  end if;
  update public.part_issues
     set resolved_at = now(), resolved_by = auth.uid(),
         resolution = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_issue_id;
end $$;

revoke all on function public.resolve_part_issue(uuid, text) from public, anon;
grant execute on function public.resolve_part_issue(uuid, text) to authenticated;

-- ===== 12) تسليم فستان العميلة بقائمة تأشير =====
create or replace function public.deliver_order_parts(p_order_id uuid, p_parts text[]) returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  o public.orders;
  v_check text[];
  v_given text[];
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

  update public.order_stages
     set status = 'done',
         started_at = coalesce(started_at, now()),
         completed_at = coalesce(completed_at, now()),
         review_status = 'approved'
   where order_id = o.id and stage::text = 'delivery' and status::text <> 'done';

  update public.orders
     set current_stage = 'delivery', state = 'delivered', delivered_parts = v_given
   where id = o.id;

  perform private.log_activity(o.id, null, 'dress_delivered',
    'سُلّم للعميلة: ' || array_to_string(v_given, '، '));

  if cardinality(private.text_minus(v_check, v_given)) > 0 then
    insert into public.part_issues (stage, branch_id, order_id, title, missing, created_by)
    values ('deliver', o.branch_id, o.id, 'طلب ' || o.order_no || ' — ' || o.client_name,
            private.text_minus(v_check, v_given), auth.uid());
  end if;
end $$;

revoke all on function public.deliver_order_parts(uuid, text[]) from public, anon;
grant execute on function public.deliver_order_parts(uuid, text[]) to authenticated;

-- ===== 13) فواتير البيع =====
alter table public.invoices
  add column if not exists client_name text,
  add column if not exists client_phone text;

alter table public.invoice_lines
  add column if not exists goods_item_id uuid references public.goods_items(id),
  -- سعر الوحدة شامل الضريبة (فواتير البيع)، والسعر المفترض وقت البيع للمقارنة
  add column if not exists unit_price_incl numeric(12,2),
  add column if not exists list_price numeric(12,2);

alter table public.payments
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null;

create index if not exists payments_invoice_idx on public.payments(invoice_id);

-- فواتير البيع: السعر شامل الضريبة، فتُستخرج الضريبة من الإجمالي
create or replace function public.recalc_invoice_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice uuid := coalesce(new.invoice_id, old.invoice_id);
  v_sub numeric;
  v_incl numeric;
  v_rate numeric;
  v_taxable boolean;
  v_scope text;
begin
  select vat_rate, is_taxable, scope::text into v_rate, v_taxable, v_scope
    from public.invoices where id = v_invoice;

  if v_scope = 'sale' then
    select coalesce(sum(qty * coalesce(unit_price_incl, unit_price)), 0) into v_incl
      from public.invoice_lines where invoice_id = v_invoice;
    v_incl := round(v_incl, 2);
    v_sub := case when v_taxable then round(v_incl * 100 / (100 + coalesce(v_rate, 0)), 2) else v_incl end;
    update public.invoices
       set subtotal = v_sub, tax_amount = v_incl - v_sub, total = v_incl
     where id = v_invoice;
    return coalesce(new, old);
  end if;

  select coalesce(sum(qty * unit_price), 0) into v_sub
    from public.invoice_lines where invoice_id = v_invoice;

  update public.invoices
     set subtotal = round(v_sub, 2),
         tax_amount = case when v_taxable then round(v_sub * coalesce(v_rate, 0) / 100, 2) else 0 end,
         total = round(v_sub, 2)
           + case when v_taxable then round(v_sub * coalesce(v_rate, 0) / 100, 2) else 0 end
   where id = v_invoice;
  return coalesce(new, old);
end $$;

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
  v_entry uuid;
begin
  if new.status <> 'issued' or old.status = 'issued' then
    return new;
  end if;

  v_receivable := case new.scope::text when 'rental' then '1220' when 'sale' then '1230' else '1210' end;
  v_revenue := case new.scope::text when 'rental' then '4210' when 'sale' then '4310' else '4110' end;

  v_lines := jsonb_build_array(
    jsonb_build_object('code', v_receivable, 'debit', new.total, 'credit', 0),
    jsonb_build_object('code', v_revenue, 'debit', 0, 'credit', new.subtotal)
  );
  if new.tax_amount > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('code', '2210', 'debit', 0, 'credit', new.tax_amount));
  end if;

  v_entry := private.post_entry(new.issue_date, 'فاتورة ' || new.invoice_no,
    'invoice', new.id, v_lines, new.created_by);
  if new.scope::text = 'sale' then
    perform private.post_entry_branch(v_entry, new.branch_id);
  end if;
  return new;
end $$;

-- سند قبض البيع يسدد مدينو المبيعات (الإيراد سُجّل مع الفاتورة)
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
  elsif new.scope = 'rental' then
    -- قبل تسليم الفستان دفعة مقدمة، وبعده إيراد تأجير
    select delivered_at is not null into v_delivered
      from public.rental_records where id = new.rental_record_id;
    v_credit := case when coalesce(v_delivered, false) then '4210' else '2110' end;
  else
    v_credit := '2110';
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

-- البائعة ترى فواتير البيع في فرعها (لطباعتها)
drop policy if exists "sellers read sale invoices" on public.invoices;
create policy "sellers read sale invoices" on public.invoices
for select to authenticated
using (scope::text = 'sale'
       and private.can(auth.uid(), 'goods.sell')
       and private.branch_ok(auth.uid(), branch_id));

drop policy if exists "sellers read sale invoice lines" on public.invoice_lines;
create policy "sellers read sale invoice lines" on public.invoice_lines
for select to authenticated
using (exists (
  select 1 from public.invoices i
   where i.id = invoice_id
     and i.scope::text = 'sale'
     and private.can(auth.uid(), 'goods.sell')
     and private.branch_ok(auth.uid(), i.branch_id)
));

-- ===== 14) البيع =====
-- p_lines: [{"item_id": uuid, "qty": 1, "price": 650}] — السعر للوحدة شامل الضريبة
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

revoke all on function public.sell_goods(uuid, text, text, public.payment_method, jsonb, text) from public, anon;
grant execute on function public.sell_goods(uuid, text, text, public.payment_method, jsonb, text) to authenticated;

-- ===== 15) صور الأصناف (نفس مخزن الصور) =====
drop policy if exists "inventory images insert by managers" on storage.objects;
create policy "inventory images insert by managers" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'inventory' and owner = auth.uid()
  and (private.can(auth.uid(), 'inventory.manage') or private.can(auth.uid(), 'rentals.manage')
       or private.can(auth.uid(), 'catalog.manage') or private.can(auth.uid(), 'goods.manage'))
);

drop policy if exists "inventory images update by managers" on storage.objects;
create policy "inventory images update by managers" on storage.objects
for update to authenticated
using (bucket_id = 'inventory'
       and (private.can(auth.uid(), 'inventory.manage') or private.can(auth.uid(), 'rentals.manage')
            or private.can(auth.uid(), 'catalog.manage') or private.can(auth.uid(), 'goods.manage')))
with check (bucket_id = 'inventory'
       and (private.can(auth.uid(), 'inventory.manage') or private.can(auth.uid(), 'rentals.manage')
            or private.can(auth.uid(), 'catalog.manage') or private.can(auth.uid(), 'goods.manage')));

drop policy if exists "inventory images delete by managers" on storage.objects;
create policy "inventory images delete by managers" on storage.objects
for delete to authenticated
using (bucket_id = 'inventory'
       and (private.can(auth.uid(), 'inventory.manage') or private.can(auth.uid(), 'rentals.manage')
            or private.can(auth.uid(), 'catalog.manage') or private.can(auth.uid(), 'goods.manage')));

-- ===== 16) الصلاحيات الافتراضية (تُضاف فقط) =====
insert into public.role_permissions (role_id, permission)
select r.id, p.perm
  from public.roles r
  join (values
    ('supervisor','goods.manage'),('supervisor','goods.transfer'),('supervisor','goods.sell'),
    ('cs','goods.transfer'),('cs','goods.sell')
  ) as p(role_key, perm) on p.role_key = r.key
on conflict (role_id, permission) do nothing;
