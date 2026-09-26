-- حجز فستان الإيجار بنفس تفاصيل الطلب الجديد: المقاسات، ورسمة لوحة الرسم،
-- وبروفة ثانية، وتاريخ المناسبة.
--  • الرسمة تنحفظ في مخزن صور المخزون (inventory) تحت rental-sketches/<الفستان>/
--    لأن ملفات الطلبات مربوطة برقم طلب، وحجز الإيجار ما له طلب.
--  • التعديل عليها بعد الحجز (وقت البروفة مثلًا) بنفس صلاحية إدارة الإيجار.
-- آمن لو انعاد تشغيله.

begin;

set local lock_timeout = '20s';
lock table public.rental_records in access exclusive mode;

alter table public.rental_records
  add column if not exists measurements jsonb not null default '{}'::jsonb,
  add column if not exists sketch_path text,
  add column if not exists fitting2_date date,
  add column if not exists event_date date;

commit;
