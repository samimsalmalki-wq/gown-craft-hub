create type public.app_role as enum ('admin','staff');
create type public.stage_key as enum ('booking','measurements','design','materials','cutting','sewing','finishing','fitting1','alterations','fitting2','quality','prep_delivery','delivery');
create type public.stage_status as enum ('pending','in_progress','done','blocked');
create type public.payment_status as enum ('unpaid','partial','paid');
create type public.order_state as enum ('active','delivered','cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  job_title text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create table public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null,
  unique (user_id, permission)
);
grant select on public.user_permissions to authenticated;
grant all on public.user_permissions to service_role;
alter table public.user_permissions enable row level security;

create sequence public.order_no_seq start 1044;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique default ('A-' || nextval('public.order_no_seq')::text),
  booked_at date not null default current_date,
  due_date date,
  client_name text not null,
  client_phone text,
  client_contact text,
  measurements jsonb not null default '{}'::jsonb,
  materials text,
  notes text,
  total_amount numeric(12,2) not null default 0,
  deposit_amount numeric(12,2) not null default 0,
  payment_status public.payment_status not null default 'unpaid',
  state public.order_state not null default 'active',
  current_stage public.stage_key not null default 'booking',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.orders to authenticated;
grant all on public.orders to service_role;
alter table public.orders enable row level security;
create index orders_due_date_idx on public.orders (due_date);
create index orders_client_name_idx on public.orders (client_name);
create index orders_client_phone_idx on public.orders (client_phone);

create table public.order_stages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  stage public.stage_key not null,
  position int not null,
  status public.stage_status not null default 'pending',
  assignee_id uuid references public.profiles(id) on delete set null,
  assignee_name text,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  updated_at timestamptz not null default now(),
  unique (order_id, stage)
);
grant select, insert, update, delete on public.order_stages to authenticated;
grant all on public.order_stages to service_role;
alter table public.order_stages enable row level security;
create index order_stages_order_idx on public.order_stages (order_id);

create table public.order_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  stage_id uuid references public.order_stages(id) on delete cascade,
  storage_path text not null,
  kind text not null default 'dress',
  caption text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.order_files to authenticated;
grant all on public.order_files to service_role;
alter table public.order_files enable row level security;
create index order_files_order_idx on public.order_files (order_id);

create policy "profiles readable by authenticated" on public.profiles for select to authenticated using (true);
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "own profile or admin update" on public.profiles for update to authenticated using (id = auth.uid() or public.has_role(auth.uid(),'admin'));

create policy "roles readable by authenticated" on public.user_roles for select to authenticated using (true);
create policy "admins manage roles" on public.user_roles for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create policy "permissions readable by authenticated" on public.user_permissions for select to authenticated using (true);
create policy "admins manage permissions" on public.user_permissions for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create policy "orders readable" on public.orders for select to authenticated using (true);
create policy "orders insert" on public.orders for insert to authenticated with check (true);
create policy "orders update" on public.orders for update to authenticated using (true);
create policy "orders delete admin" on public.orders for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create policy "stages readable" on public.order_stages for select to authenticated using (true);
create policy "stages insert" on public.order_stages for insert to authenticated with check (true);
create policy "stages update" on public.order_stages for update to authenticated using (true);
create policy "stages delete admin" on public.order_stages for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create policy "files readable" on public.order_files for select to authenticated using (true);
create policy "files insert" on public.order_files for insert to authenticated with check (true);
create policy "files delete" on public.order_files for delete to authenticated using (created_by = auth.uid() or public.has_role(auth.uid(),'admin'));

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();
create trigger stages_touch before update on public.order_stages for each row execute function public.touch_updated_at();

create or replace function public.create_default_stages()
returns trigger language plpgsql set search_path = public as $$
declare k public.stage_key; i int := 0;
begin
  foreach k in array array['booking','measurements','design','materials','cutting','sewing','finishing','fitting1','alterations','fitting2','quality','prep_delivery','delivery']::public.stage_key[]
  loop
    i := i + 1;
    insert into public.order_stages (order_id, stage, position, status)
    values (new.id, k, i, case when i = 1 then 'in_progress'::public.stage_status else 'pending'::public.stage_status end);
  end loop;
  return new;
end; $$;

create trigger orders_create_stages after insert on public.orders for each row execute function public.create_default_stages();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare has_admin boolean;
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;

  select exists (select 1 from public.user_roles where role = 'admin') into has_admin;
  insert into public.user_roles (user_id, role)
  values (new.id, case when has_admin then 'staff'::public.app_role else 'admin'::public.app_role end)
  on conflict do nothing;
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create policy "order files read" on storage.objects for select to authenticated using (bucket_id = 'order-files');
create policy "order files upload" on storage.objects for insert to authenticated with check (bucket_id = 'order-files');
create policy "order files update" on storage.objects for update to authenticated using (bucket_id = 'order-files');
create policy "order files delete" on storage.objects for delete to authenticated using (bucket_id = 'order-files');

insert into public.orders (order_no, booked_at, due_date, client_name, client_phone, client_contact, measurements, materials, notes, total_amount, deposit_amount, payment_status, current_stage)
values
 ('A-1038', current_date - 40, current_date + 12, 'لمى الشهري', '0551234567', 'واتساب 0551234567', '{"الطول":"168","الصدر":"88","الخصر":"70","الأرداف":"96","طول الكم":"58"}', 'ساتان حريري أبيض + دانتيل فرنسي', 'ترغب بذيل قصير', 18000, 6000, 'partial', 'cutting'),
 ('A-1039', current_date - 55, current_date - 3, 'ريم العتيبي', '0559876543', 'انستقرام @reem', '{"الطول":"162","الصدر":"90","الخصر":"74","الأرداف":"100"}', 'كريب مطرز + تول', 'حساسية من الترتر الخشن', 24000, 8000, 'partial', 'alterations'),
 ('A-1040', current_date - 30, current_date + 3, 'هيا الدوسري', '0533221100', 'واتساب 0533221100', '{"الطول":"170","الصدر":"86","الخصر":"68","الأرداف":"94"}', 'تول مطرز يدويًا', 'بروفة أولى الأسبوع القادم', 32000, 32000, 'paid', 'fitting1'),
 ('A-1041', current_date - 20, current_date + 6, 'نورة القحطاني', '0544332211', 'اتصال مباشر', '{"الطول":"165","الصدر":"92","الخصر":"76","الأرداف":"102"}', 'ميكادو + دانتيل', 'تعديل ضيق الخصر', 21000, 21000, 'paid', 'sewing'),
 ('A-1042', current_date - 8, current_date + 20, 'سارة المطيري', '0500112233', 'واتساب 0500112233', '{"الطول":"160","الصدر":"84","الخصر":"66","الأرداف":"92"}', 'ساتان + تول ناعم', 'تفضل أكمام طويلة', 19500, 5000, 'partial', 'sewing'),
 ('A-1043', current_date - 2, current_date + 45, 'دانة العنزي', '0566778899', 'واتساب 0566778899', '{}', 'لم تُحدد بعد', 'أول زيارة، بانتظار المقاسات', 15000, 0, 'unpaid', 'booking');

update public.order_stages s
set status = 'done', started_at = now() - interval '20 days', completed_at = now() - interval '15 days', assignee_name = 'منى العلي'
where s.position < (select p.position from public.order_stages p join public.orders o on o.id = p.order_id and o.current_stage = p.stage where p.order_id = s.order_id);

update public.order_stages s
set status = 'in_progress', started_at = now() - interval '3 days', assignee_name = 'سلمى ناصر'
where exists (select 1 from public.orders o where o.id = s.order_id and o.current_stage = s.stage);
