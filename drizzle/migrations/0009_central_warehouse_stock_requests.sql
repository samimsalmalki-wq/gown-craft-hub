-- ===== 1) علم المخزن الرئيسي على الفروع =====
alter table public.branches
  add column if not exists is_warehouse boolean not null default false;

-- ===== 2) طلبات صرف الخامات من المخزن =====
do $$ begin
  create type public.stock_request_status as enum ('pending','approved','rejected');
exception when duplicate_object then null; end $$;

create table if not exists public.stock_requests (
  id uuid primary key default gen_random_uuid(),
  from_branch_id uuid not null references public.branches(id) on delete cascade,
  to_branch_id uuid not null references public.branches(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  qty numeric not null,
  reason text,
  status public.stock_request_status not null default 'pending',
  decision_note text,
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stock_requests_to_branch_idx on public.stock_requests(to_branch_id);
create index if not exists stock_requests_status_idx on public.stock_requests(status);

grant select, insert, update on public.stock_requests to authenticated;
grant all on public.stock_requests to service_role;
alter table public.stock_requests enable row level security;

create policy "stock requests readable" on public.stock_requests
for select to authenticated
using (
  private.is_team(auth.uid())
  and (
    private.branch_ok(auth.uid(), to_branch_id)
    or private.can(auth.uid(), 'inventory.approve')
    or private.can(auth.uid(), 'inventory.transfer')
  )
);

create policy "stock requests insert by branch" on public.stock_requests
for insert to authenticated
with check (
  (private.can(auth.uid(), 'inventory.request') or private.can(auth.uid(), 'inventory.manage'))
  and private.branch_ok(auth.uid(), to_branch_id)
  and status = 'pending'
);

create policy "stock requests update by approver" on public.stock_requests
for update to authenticated
using (private.can(auth.uid(), 'inventory.approve') or private.can(auth.uid(), 'inventory.transfer'))
with check (private.can(auth.uid(), 'inventory.approve') or private.can(auth.uid(), 'inventory.transfer'));

create trigger stock_requests_touch before update on public.stock_requests
for each row execute function public.touch_updated_at();

-- ===== 3) اعتماد أو رفض الطلب =====
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

  insert into public.material_movements (material_id, branch_id, kind, qty, notes, created_by)
  values (r.material_id, r.from_branch_id, 'out', r.qty,
          'صرف على طلب فرع — ' || coalesce(v_name,''), auth.uid());

  insert into public.material_movements (material_id, branch_id, kind, qty, notes, created_by)
  values (r.material_id, r.to_branch_id, 'in', r.qty,
          'استلام من المخزن الرئيسي — ' || coalesce(v_name,''), auth.uid());

  update public.stock_requests
     set status = 'approved', decision_note = p_note,
         decided_by = auth.uid(), decided_at = now()
   where id = p_id;
end $$;

grant execute on function public.decide_stock_request(uuid, boolean, text) to authenticated;