-- حجز فستان الإيجار: رقم فاتورة نظام المبيعات، وموعد بروفة عند الحاجة،
-- وأرقام سندات التأمين على العقد لإرسال إيصال الاستلام والرد للعميلة بالواتساب.

-- ===== 1) الأعمدة =====
alter table public.rental_records
  add column if not exists external_invoice_no text,
  add column if not exists fitting_date date,
  add column if not exists deposit_receipt_no text,
  add column if not exists refund_voucher_no text,
  add column if not exists refund_method public.payment_method,
  add column if not exists cancel_voucher_no text;

create unique index if not exists rental_records_external_invoice_no_key
  on public.rental_records (external_invoice_no)
  where external_invoice_no is not null;

-- رقم الفاتورة لا يتكرر بين طلبات التفصيل وحجوزات الإيجار (نفس نظام المبيعات)
create or replace function private.check_external_invoice_no() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
begin
  new.external_invoice_no := nullif(btrim(coalesce(new.external_invoice_no, '')), '');
  if new.external_invoice_no is null then
    return new;
  end if;
  if tg_table_name = 'orders' then
    if exists (select 1 from public.rental_records where external_invoice_no = new.external_invoice_no) then
      raise exception 'رقم الفاتورة % مستخدم في حجز فستان إيجار', new.external_invoice_no
        using errcode = 'unique_violation';
    end if;
  else
    if exists (select 1 from public.orders where external_invoice_no = new.external_invoice_no) then
      raise exception 'رقم الفاتورة % مستخدم في طلب تفصيل', new.external_invoice_no
        using errcode = 'unique_violation';
    end if;
    if exists (select 1 from public.rental_records
                where external_invoice_no = new.external_invoice_no and id <> new.id) then
      raise exception 'رقم الفاتورة % مستخدم في حجز آخر', new.external_invoice_no
        using errcode = 'unique_violation';
    end if;
  end if;
  return new;
end $$;

revoke all on function private.check_external_invoice_no() from public;
grant execute on function private.check_external_invoice_no() to authenticated;

drop trigger if exists orders_invoice_unique on public.orders;
create trigger orders_invoice_unique before insert or update of external_invoice_no on public.orders
  for each row execute function private.check_external_invoice_no();

drop trigger if exists rental_records_invoice_unique on public.rental_records;
create trigger rental_records_invoice_unique
  before insert or update of external_invoice_no on public.rental_records
  for each row execute function private.check_external_invoice_no();

-- ===== 2) أرقام السندات على العقد (للعرض والإيصالات بدون صلاحيات المالية) =====
create or replace function public.sync_rental_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec uuid := coalesce(new.rental_record_id, old.rental_record_id);
begin
  if v_rec is null then
    return coalesce(new, old);
  end if;
  update public.rental_records r
     set paid_amount = coalesce((select sum(amount) from public.payments
                                  where rental_record_id = v_rec and not is_security_deposit), 0),
         deposit_paid = coalesce((select sum(amount) from public.payments
                                   where rental_record_id = v_rec and is_security_deposit), 0),
         deposit_receipt_no = (select receipt_no from public.payments
                                where rental_record_id = v_rec and is_security_deposit
                                order by created_at desc limit 1)
   where r.id = v_rec;
  return coalesce(new, old);
end $$;

revoke all on function public.sync_rental_payment() from public, anon, authenticated;

create or replace function public.sync_rental_voucher()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.rental_record_id is null then
    return new;
  end if;
  if new.kind = 'deposit_refund' then
    update public.rental_records
       set refund_voucher_no = new.voucher_no, refund_method = new.method
     where id = new.rental_record_id;
  elsif new.kind = 'cancel_refund' then
    update public.rental_records
       set cancel_voucher_no = new.voucher_no
     where id = new.rental_record_id;
  end if;
  return new;
end $$;

revoke all on function public.sync_rental_voucher() from public, anon, authenticated;

drop trigger if exists cash_vouchers_sync_rental on public.cash_vouchers;
create trigger cash_vouchers_sync_rental after insert on public.cash_vouchers
  for each row execute function public.sync_rental_voucher();

-- ما سبق تسجيله قبل هذا التعديل
update public.rental_records r
   set deposit_receipt_no = (select p.receipt_no from public.payments p
                              where p.rental_record_id = r.id and p.is_security_deposit
                              order by p.created_at desc limit 1)
 where r.deposit_receipt_no is null
   and exists (select 1 from public.payments p where p.rental_record_id = r.id and p.is_security_deposit);

update public.rental_records r
   set refund_voucher_no = v.voucher_no, refund_method = v.method
  from public.cash_vouchers v
 where v.rental_record_id = r.id and v.kind = 'deposit_refund' and r.refund_voucher_no is null;

update public.rental_records r
   set cancel_voucher_no = v.voucher_no
  from public.cash_vouchers v
 where v.rental_record_id = r.id and v.kind = 'cancel_refund' and r.cancel_voucher_no is null;

-- أرقام السندات لا تُعدَّل من التطبيق مباشرة
create or replace function private.guard_rental_record_columns() returns trigger
    language plpgsql
    set search_path to 'public'
    as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.tracks_money := true;
    new.delivered_at := null;
    new.delivered_by := null;
    new.paid_amount := 0;
    new.deposit_paid := 0;
    new.deposit_method := null;
    new.deposit_refunded := 0;
    new.deposit_receipt_no := null;
    new.refund_voucher_no := null;
    new.refund_method := null;
    new.cancel_voucher_no := null;
    new.cancel_requested_at := null;
    new.cancel_requested_by := null;
    new.cancel_reason := null;
    new.cancelled_at := null;
    new.cancelled_by := null;
    new.cancel_refund := 0;
    new.cancel_kept := 0;
  else
    new.tracks_money := old.tracks_money;
    new.delivered_at := old.delivered_at;
    new.delivered_by := old.delivered_by;
    new.paid_amount := old.paid_amount;
    new.deposit_paid := old.deposit_paid;
    new.deposit_method := old.deposit_method;
    new.deposit_refunded := old.deposit_refunded;
    new.deposit_receipt_no := old.deposit_receipt_no;
    new.refund_voucher_no := old.refund_voucher_no;
    new.refund_method := old.refund_method;
    new.cancel_voucher_no := old.cancel_voucher_no;
    new.damage_amount := old.damage_amount;
    new.cancel_requested_at := old.cancel_requested_at;
    new.cancel_requested_by := old.cancel_requested_by;
    new.cancel_reason := old.cancel_reason;
    new.cancelled_at := old.cancelled_at;
    new.cancelled_by := old.cancelled_by;
    new.cancel_refund := old.cancel_refund;
    new.cancel_kept := old.cancel_kept;
  end if;
  return new;
end $$;

-- ===== 3) الحجز: رقم الفاتورة وموعد البروفة =====
drop function if exists public.book_rental(uuid, text, text, date, date, numeric, numeric, text, numeric, public.payment_method);

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
  p_fitting_date date default null
) returns uuid
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_branch uuid;
  v_code text;
  v_rec uuid;
  v_invoice text := nullif(btrim(coalesce(p_invoice_no, '')), '');
begin
  if not private.can(auth.uid(), 'rentals.manage') then
    raise exception 'غير مصرح';
  end if;
  select branch_id, code into v_branch, v_code from public.rental_dresses where id = p_dress_id;
  if v_code is null then
    raise exception 'الفستان غير موجود';
  end if;
  if not private.branch_ok(auth.uid(), v_branch) then
    raise exception 'غير مصرح';
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

revoke all on function public.book_rental(uuid, text, text, date, date, numeric, numeric, text, numeric, public.payment_method, text, date) from public, anon;
grant execute on function public.book_rental(uuid, text, text, date, date, numeric, numeric, text, numeric, public.payment_method, text, date) to authenticated;

-- ===== 4) رسائل الواتساب: إيصال استلام التأمين ورده وتذكير البروفة =====
insert into public.whatsapp_templates (key, label, body, position) values
  ('rental_deposit_received', 'إيصال استلام التأمين', 'مرحبًا {client_name} 🌸
استلمنا منك تأمين فستان الإيجار {dress_code}.
المبلغ: {deposit_paid} ({deposit_method})
رقم السند: {receipt_no}
رقم الفاتورة: {invoice_no}
تاريخ الاستلام: {delivered_date}
موعد إرجاع الفستان: {return_due_date}
يُرد التأمين عند إرجاع الفستان بحالته، ويُخصم منه أي تلف أو تنظيف.', 20),
  ('rental_deposit_refunded', 'إيصال رد التأمين', 'مرحبًا {client_name} 🌸
استلمنا فستان الإيجار {dress_code} بتاريخ {returned_date}، شكرًا لك.
التأمين المقبوض: {deposit_paid}
خصم تلف أو تنظيف: {damage_amount}
المبلغ المسترد لك: {deposit_refund} ({refund_method})
رقم سند الصرف: {voucher_no}', 21),
  ('rental_fitting', 'تذكير بروفة فستان الإيجار', 'مرحبًا {client_name} 🌸
تذكير بموعد بروفة فستان الإيجار {dress_code}.
الموعد: {fitting_date}
نتشرف بحضورك.', 22)
on conflict (key) do nothing;
