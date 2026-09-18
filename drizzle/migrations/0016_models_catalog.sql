create table public.models (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  item_type_id uuid references public.item_types(id),
  est_price numeric not null default 0,
  description text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table public.model_images (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.models(id) on delete cascade,
  storage_path text not null,
  position integer not null default 1,
  created_at timestamptz not null default now()
);

create table public.model_materials (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.models(id) on delete cascade,
  material_id uuid not null references public.materials(id),
  qty numeric not null check (qty > 0),
  unique (model_id, material_id)
);

create index model_images_model_idx on public.model_images(model_id);
create index model_materials_model_idx on public.model_materials(model_id);

alter table public.orders add column if not exists model_id uuid references public.models(id);

grant select, insert, update, delete on public.models to authenticated;
grant all on public.models to service_role;
grant select, insert, update, delete on public.model_images to authenticated;
grant all on public.model_images to service_role;
grant select, insert, update, delete on public.model_materials to authenticated;
grant all on public.model_materials to service_role;

alter table public.models enable row level security;
alter table public.model_images enable row level security;
alter table public.model_materials enable row level security;

create policy "team reads models" on public.models for select to authenticated using (private.is_team(auth.uid()));
create policy "managers add models" on public.models for insert to authenticated with check (private.is_manager_or_supervisor(auth.uid()));
create policy "managers update models" on public.models for update to authenticated using (private.is_manager_or_supervisor(auth.uid())) with check (private.is_manager_or_supervisor(auth.uid()));
create policy "admin deletes models" on public.models for delete to authenticated using (private.has_role(auth.uid(), 'admin'::app_role));

create policy "team reads model images" on public.model_images for select to authenticated using (private.is_team(auth.uid()));
create policy "managers write model images" on public.model_images for insert to authenticated with check (private.is_manager_or_supervisor(auth.uid()));
create policy "managers delete model images" on public.model_images for delete to authenticated using (private.is_manager_or_supervisor(auth.uid()));

create policy "team reads model materials" on public.model_materials for select to authenticated using (private.is_team(auth.uid()));
create policy "managers write model materials" on public.model_materials for insert to authenticated with check (private.is_manager_or_supervisor(auth.uid()));
create policy "managers update model materials" on public.model_materials for update to authenticated using (private.is_manager_or_supervisor(auth.uid())) with check (private.is_manager_or_supervisor(auth.uid()));
create policy "managers delete model materials" on public.model_materials for delete to authenticated using (private.is_manager_or_supervisor(auth.uid()));
