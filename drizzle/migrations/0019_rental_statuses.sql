-- حالات فساتين الإيجار تصبح قائمة يعدّلها المدير (إضافة وحذف وتسمية وترتيب)
-- الحالات الأساسية (متاح، مؤجَّر، متأخر في الترجيع) يحددها النظام تلقائيًا
-- عند التأجير والإرجاع، فتُعدَّل أسماؤها وألوانها وترتيبها لكن لا تُحذف.
-- «متأخر في الترجيع» تُحسب في التطبيق للفستان الخارج بعد موعد إرجاعه.

-- ===== 1) جدول الحالات =====
create table if not exists public.rental_statuses (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  tone text not null default 'neutral' check (tone in ('ok','gold','soon','late','neutral')),
  -- الفستان في هذه الحالة يظهر في البحث بتاريخ المناسبة ويقبل الحجز
  bookable boolean not null default true,
  is_builtin boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.rental_statuses to authenticated;
grant all on public.rental_statuses to service_role;
alter table public.rental_statuses enable row level security;

drop policy if exists "team reads rental statuses" on public.rental_statuses;
create policy "team reads rental statuses" on public.rental_statuses
for select to authenticated using (private.is_team(auth.uid()));

drop policy if exists "catalog adds rental statuses" on public.rental_statuses;
create policy "catalog adds rental statuses" on public.rental_statuses
for insert to authenticated
with check (private.can(auth.uid(), 'catalog.manage') and not is_builtin);

drop policy if exists "catalog updates rental statuses" on public.rental_statuses;
create policy "catalog updates rental statuses" on public.rental_statuses
for update to authenticated
using (private.can(auth.uid(), 'catalog.manage'))
with check (private.can(auth.uid(), 'catalog.manage'));

drop policy if exists "catalog deletes rental statuses" on public.rental_statuses;
create policy "catalog deletes rental statuses" on public.rental_statuses
for delete to authenticated
using (private.can(auth.uid(), 'catalog.manage') and not is_builtin);

drop trigger if exists rental_statuses_touch on public.rental_statuses;
create trigger rental_statuses_touch before update on public.rental_statuses
  for each row execute function public.touch_updated_at();

-- المفتاح وعلامة «أساسية» لا يتغيران بعد الإنشاء
create or replace function private.guard_rental_status_columns() returns trigger
    language plpgsql
    set search_path to 'public'
    as $$
begin
  new.key := old.key;
  new.is_builtin := old.is_builtin;
  return new;
end $$;

revoke all on function private.guard_rental_status_columns() from public;
grant execute on function private.guard_rental_status_columns() to authenticated;

drop trigger if exists rental_statuses_guard on public.rental_statuses;
create trigger rental_statuses_guard before update on public.rental_statuses
  for each row execute function private.guard_rental_status_columns();

insert into public.rental_statuses (key, label, tone, bookable, is_builtin, position) values
  ('available',     'متاح',              'ok',      true,  true,  1),
  ('rented',        'مؤجَّر',            'gold',    true,  true,  2),
  ('late_return',   'متأخر في الترجيع', 'late',    true,  true,  3),
  ('cleaning',      'في التنظيف',        'soon',    true,  false, 4),
  ('repair',        'تحت الإصلاح',       'late',    true,  false, 5),
  ('in_production', 'قيد التصنيع',       'soon',    true,  false, 6),
  ('retired',       'خارج الخدمة',       'neutral', false, false, 7)
on conflict (key) do nothing;

-- ===== 2) حالة الفستان نص يشير إلى القائمة بدل النوع الثابت =====
alter table public.rental_dresses alter column status drop default;
alter table public.rental_dresses alter column status type text using status::text;
alter table public.rental_dresses alter column status set default 'available';

alter table public.rental_dresses drop constraint if exists rental_dresses_status_fkey;
alter table public.rental_dresses
  add constraint rental_dresses_status_fkey
  foreign key (status) references public.rental_statuses(key) on update cascade;

-- ===== 3) التأجير والإرجاع يغيّران الحالة تلقائيًا =====
-- عند الإرجاع يُختار ما يصير إليه الفستان من الحالات الموجودة (return_condition = مفتاح الحالة)،
-- وإذا حُذفت الحالة أو كانت القيمة قديمة مثل 'ok' يرجع الفستان «متاح».
CREATE OR REPLACE FUNCTION public.apply_rental_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.returned_at IS NULL AND NEW.out_date <= current_date THEN
      UPDATE public.rental_dresses SET status = 'rented' WHERE id = NEW.dress_id AND status = 'available';
    END IF;
  ELSIF NEW.returned_at IS NOT NULL AND OLD.returned_at IS NULL THEN
    UPDATE public.rental_dresses
       SET status = CASE
         WHEN NEW.return_condition NOT IN ('rented', 'late_return')
          AND EXISTS (SELECT 1 FROM public.rental_statuses s WHERE s.key = NEW.return_condition)
         THEN NEW.return_condition
         ELSE 'available' END
     WHERE id = NEW.dress_id;
  ELSIF NEW.returned_at IS NULL AND NEW.out_date <= current_date THEN
    UPDATE public.rental_dresses SET status = 'rented' WHERE id = NEW.dress_id AND status = 'available';
  END IF;
  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public.apply_rental_status() FROM PUBLIC, anon, authenticated;
