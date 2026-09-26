-- نصوص إيصالات التأمين ومحتواها: يعدّلها مدير النظام من الإعدادات
create table if not exists public.receipt_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key in ('deposit_received', 'deposit_refunded')),
  title text not null,
  subtitle text,
  amount_label text not null,
  -- البيانات الظاهرة بالترتيب: مفاتيح من قائمة ثابتة في التطبيق
  fields text[] not null default '{}',
  terms text,
  note text,
  show_signatures boolean not null default true,
  customer_signature_label text not null default 'توقيع العميلة',
  staff_signature_label text not null default 'الموظف/ة',
  show_staff_name boolean not null default true,
  footer text,
  updated_at timestamptz not null default now()
);

grant select, update on public.receipt_templates to authenticated;
grant all on public.receipt_templates to service_role;
alter table public.receipt_templates enable row level security;

drop policy if exists "team reads receipt templates" on public.receipt_templates;
create policy "team reads receipt templates" on public.receipt_templates
for select to authenticated using (private.is_team(auth.uid()));

drop policy if exists "admin updates receipt templates" on public.receipt_templates;
create policy "admin updates receipt templates" on public.receipt_templates
for update to authenticated
using (private.has_role(auth.uid(), 'admin'))
with check (private.has_role(auth.uid(), 'admin'));

drop trigger if exists receipt_templates_touch on public.receipt_templates;
create trigger receipt_templates_touch before update on public.receipt_templates
  for each row execute function public.touch_updated_at();

insert into public.receipt_templates (key, title, subtitle, amount_label, fields, terms, footer) values
  ('deposit_received', 'إيصال استلام تأمين', 'فستان إيجار', 'مبلغ التأمين المستلم',
   '{client_name,client_phone,dress_code,invoice_no,delivered_date,due_date}',
   'استلمنا من العميلة المذكورة أعلاه مبلغ التأمين عن فستان الإيجار، وهو أمانة لدينا تُرد لها عند إرجاع الفستان بحالته في الموعد المحدد، ويُخصم منها ما يلزم للتلف أو التنظيف.',
   'صدر من نظام مَعْمَل · {issued_at}'),
  ('deposit_refunded', 'إيصال رد تأمين', 'فستان إيجار', 'المبلغ المسترد للعميلة',
   '{client_name,client_phone,dress_code,invoice_no,delivered_date,returned_date}',
   'استلمنا فستان الإيجار من العميلة، ورُدّ لها مبلغ التأمين بعد خصم ما ذُكر أعلاه، وبذلك تبرأ ذمة الطرفين فيما يخص هذا التأمين.',
   'صدر من نظام مَعْمَل · {issued_at}')
on conflict (key) do nothing;
