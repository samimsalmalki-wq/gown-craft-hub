-- مبالغ الإيجار والتأمين
--  • الحجز: العربون بسند قبض في صندوق الفرع، ويُقيَّد دفعة مقدمة (2110).
--  • التسليم: باقي الإيجار بسند قبض، والتأمين في «صندوق التأمينات» (1140 مقابل 2120)،
--    ويتحول المدفوع من 2110 إلى إيراد التأجير (4210)، ويصير الفستان «مؤجَّر».
--  • الإرجاع: يُرد التأمين بسند صرف بعد خصم التلف، والخصم يدخل صندوق الفرع إيراد «تلف وتنظيف» (4220).
--  • الإلغاء: طلب من الموظفة وقرار من صاحب صلاحية rentals.cancel: رد كامل أو جزئي أو بدون رد.
--  • الإيجارات المسجّلة قبل هذا التعديل تبقى بدون مبالغ متبقية (tracks_money = false).

-- ===== 1) الحسابات =====
insert into public.gl_accounts (code, name, type, parent_id) values
  ('1140', 'صندوق التأمينات', 'asset', (select id from public.gl_accounts where code = '1000')),
  ('4220', 'إيرادات تلف وتنظيف الفساتين', 'revenue', (select id from public.gl_accounts where code = '4000'))
on conflict (code) do nothing;

-- ===== 2) صندوق التأمينات لكل فرع =====
alter table public.cash_accounts
  add column if not exists is_deposit_box boolean not null default false;

create unique index if not exists cash_accounts_one_deposit_box
  on public.cash_accounts(branch_id) where is_deposit_box;

alter table public.cash_transactions
  add column if not exists method public.payment_method;

-- صندوق تأمينات الفرع (يُنشأ إذا لم يوجد)
create or replace function private.deposit_box(_branch uuid) returns uuid
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_id uuid;
  v_name text;
begin
  select id into v_id
    from public.cash_accounts
   where is_deposit_box and branch_id is not distinct from _branch
   limit 1;
  if v_id is null then
    select name into v_name from public.branches where id = _branch;
    insert into public.cash_accounts (name, kind, gl_code, branch_id, is_deposit_box, notes)
    values ('صندوق التأمينات' || coalesce(' — ' || v_name, ''), 'cash', '1140', _branch, true,
            'أمانات العميلات من تأمين فساتين الإيجار — ليست دخلًا')
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- صندوق الفرع العادي المناسب لطريقة الدفع (نقدي / شبكة / تحويل)
create or replace function private.method_box(_branch uuid, _method public.payment_method) returns uuid
    language sql stable security definer
    set search_path to 'public'
    as $$
  select id
    from public.cash_accounts
   where is_active and not is_deposit_box
   order by (branch_id is not distinct from _branch) desc,
            (kind = case _method
                      when 'card' then 'card'::public.cash_account_kind
                      when 'transfer' then 'bank'::public.cash_account_kind
                      else 'cash'::public.cash_account_kind
                    end) desc,
            created_at
   limit 1
$$;

create or replace function private.box_gl(_box uuid) returns text
    language sql stable security definer
    set search_path to 'public'
    as $$
  select coalesce((select gl_code from public.cash_accounts where id = _box), '1110')
$$;

revoke all on function private.deposit_box(uuid) from public;
revoke all on function private.method_box(uuid, public.payment_method) from public;
revoke all on function private.box_gl(uuid) from public;

do $$
begin
  perform private.deposit_box(b.id) from public.branches b where not b.is_warehouse;
end $$;

create or replace function private.ensure_branch_deposit_box() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
begin
  if not new.is_warehouse then
    perform private.deposit_box(new.id);
  end if;
  return new;
end $$;

revoke all on function private.ensure_branch_deposit_box() from public;

drop trigger if exists branches_deposit_box on public.branches;
create trigger branches_deposit_box after insert on public.branches
  for each row execute function private.ensure_branch_deposit_box();

-- ===== 3) عقود الإيجار: التسليم والمبالغ والإلغاء =====
alter table public.rental_records
  add column if not exists delivered_at timestamptz,
  add column if not exists delivered_by uuid references public.profiles(id),
  add column if not exists paid_amount numeric(12,2) not null default 0,
  add column if not exists deposit_paid numeric(12,2) not null default 0,
  add column if not exists deposit_method public.payment_method,
  add column if not exists deposit_refunded numeric(12,2) not null default 0,
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists cancel_requested_by uuid references public.profiles(id),
  add column if not exists cancel_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id),
  add column if not exists cancel_refund numeric(12,2) not null default 0,
  add column if not exists cancel_kept numeric(12,2) not null default 0;

-- الإيجارات القديمة: بدون مبالغ متبقية، وما خرج منها يُعتبر مسلَّمًا (مرة واحدة عند إضافة العمود)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'rental_records' and column_name = 'tracks_money'
  ) then
    alter table public.rental_records add column tracks_money boolean not null default false;
    alter table public.rental_records alter column tracks_money set default true;
    update public.rental_records
       set delivered_at = out_date::timestamptz
     where delivered_at is null
       and (returned_at is not null or out_date <= current_date);
  end if;
end $$;

-- التعديل المباشر من التطبيق لا يغيّر المبالغ ولا التسليم ولا الإلغاء (تتم عبر الدوال فقط)
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

revoke all on function private.guard_rental_record_columns() from public;
grant execute on function private.guard_rental_record_columns() to authenticated;

drop trigger if exists rental_records_guard on public.rental_records;
create trigger rental_records_guard before insert or update on public.rental_records
  for each row execute function private.guard_rental_record_columns();

-- الفستان يصير «مؤجَّر» عند التسليم فقط، لا بمجرد وصول تاريخ الخروج
CREATE OR REPLACE FUNCTION public.apply_rental_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.delivered_at IS NOT NULL AND NEW.returned_at IS NULL THEN
      UPDATE public.rental_dresses SET status = 'rented' WHERE id = NEW.dress_id;
    END IF;
  ELSIF NEW.returned_at IS NOT NULL AND OLD.returned_at IS NULL THEN
    UPDATE public.rental_dresses
       SET status = CASE
         WHEN NEW.return_condition NOT IN ('rented', 'late_return')
          AND EXISTS (SELECT 1 FROM public.rental_statuses s WHERE s.key = NEW.return_condition)
         THEN NEW.return_condition
         ELSE 'available' END
     WHERE id = NEW.dress_id;
  ELSIF NEW.delivered_at IS NOT NULL AND OLD.delivered_at IS NULL AND NEW.returned_at IS NULL THEN
    UPDATE public.rental_dresses SET status = 'rented' WHERE id = NEW.dress_id;
  END IF;
  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public.apply_rental_status() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.promote_due_rentals()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.rental_dresses d
     SET status = 'rented'
   WHERE d.status = 'available'
     AND EXISTS (
       SELECT 1 FROM public.rental_records r
        WHERE r.dress_id = d.id
          AND r.returned_at IS NULL
          AND r.cancelled_at IS NULL
          AND r.delivered_at IS NOT NULL
     );
$function$;

-- الحجز الملغي لا يمنع حجز نفس الفستان
CREATE OR REPLACE FUNCTION public.check_rental_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_conflict record;
BEGIN
  IF NEW.returned_at IS NOT NULL OR NEW.cancelled_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.due_date < NEW.out_date THEN
    RAISE EXCEPTION 'تاريخ الإرجاع لا يمكن أن يكون قبل تاريخ الخروج';
  END IF;

  SELECT r.out_date, r.due_date, r.client_name INTO v_conflict
  FROM public.rental_records r
  WHERE r.dress_id = NEW.dress_id
    AND r.id <> NEW.id
    AND r.returned_at IS NULL
    AND r.cancelled_at IS NULL
    AND r.out_date <= NEW.due_date
    AND r.due_date >= NEW.out_date
  LIMIT 1;

  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'الفستان محجوز من % إلى % (%)', v_conflict.out_date, v_conflict.due_date, v_conflict.client_name;
  END IF;
  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public.check_rental_overlap() FROM PUBLIC, anon, authenticated;

-- ===== 4) الدفعات: التأمين نوع مستقل عن العربون =====
alter table public.payments
  add column if not exists is_security_deposit boolean not null default false;

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

create or replace function public.post_payment_cash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cash_account_id is not null then
    insert into public.cash_transactions
      (account_id, direction, amount, occurred_at, source, source_id, description, created_by, method)
    values (new.cash_account_id, 'in', new.amount, new.paid_at, 'payment', new.id,
            case when new.is_security_deposit then 'سند قبض تأمين ' else 'سند قبض ' end || new.receipt_no,
            new.created_by, new.method);
  end if;
  return new;
end $$;

-- مدفوع الطلب وإيراده لا يشملان التأمين
create or replace function public.sync_order_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order uuid := coalesce(new.order_id, old.order_id);
  v_paid numeric;
  v_total numeric;
begin
  if v_order is null then
    return coalesce(new, old);
  end if;

  select coalesce(sum(amount), 0) into v_paid
    from public.payments where order_id = v_order and not is_security_deposit;
  select total_amount into v_total from public.orders where id = v_order;

  update public.orders
     set deposit_amount = v_paid,
         payment_status = case
           when v_paid <= 0 then 'unpaid'::public.payment_status
           when v_paid >= coalesce(v_total, 0) and coalesce(v_total, 0) > 0 then 'paid'::public.payment_status
           else 'partial'::public.payment_status end
   where id = v_order;

  if tg_op = 'INSERT' then
    perform private.log_activity(v_order, null, 'payment_received',
      'سند قبض ' || new.receipt_no || ' — ' || new.amount::text);
  end if;
  return coalesce(new, old);
end $$;

create or replace function public.recognize_order_revenue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_paid numeric;
begin
  if new.state <> 'delivered' or old.state = 'delivered' then
    return new;
  end if;
  -- إنتاج قطعة للمخزون: لا يوجد عميل ولا إيراد عند التسليم
  if new.order_kind = 'rental_stock' then
    return new;
  end if;
  select coalesce(sum(amount), 0) into v_paid
    from public.payments where order_id = new.id and not is_security_deposit;
  if v_paid <= 0 then
    return new;
  end if;

  perform private.post_entry(current_date,
    'إثبات إيراد تسليم الطلب ' || new.order_no,
    'order_delivered', new.id,
    jsonb_build_array(
      jsonb_build_object('code', '2110', 'debit', v_paid, 'credit', 0),
      jsonb_build_object('code', '4110', 'debit', 0, 'credit', v_paid)
    ),
    new.created_by);
  return new;
end $$;

-- مدفوع الإيجار والتأمين على العقد نفسه (لعرضها بدون صلاحيات المالية)
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
                                   where rental_record_id = v_rec and is_security_deposit), 0)
   where r.id = v_rec;
  return coalesce(new, old);
end $$;

revoke all on function public.sync_rental_payment() from public, anon, authenticated;

drop trigger if exists payments_sync_rental on public.payments;
create trigger payments_sync_rental after insert or update on public.payments
  for each row execute function public.sync_rental_payment();

-- ===== 5) سند الصرف =====
create sequence if not exists public.finance_voucher_seq;

create table if not exists public.cash_vouchers (
  id uuid primary key default gen_random_uuid(),
  voucher_no text not null unique,
  kind text not null check (kind in ('deposit_refund', 'cancel_refund')),
  rental_record_id uuid references public.rental_records(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  method public.payment_method not null default 'cash',
  cash_account_id uuid not null references public.cash_accounts(id),
  paid_at date not null default current_date,
  notes text,
  branch_id uuid references public.branches(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists cash_vouchers_rental_idx on public.cash_vouchers(rental_record_id);

grant select on public.cash_vouchers to authenticated;
grant all on public.cash_vouchers to service_role;
alter table public.cash_vouchers enable row level security;

drop policy if exists "vouchers readable" on public.cash_vouchers;
create policy "vouchers readable" on public.cash_vouchers
for select to authenticated
using (
  (private.can(auth.uid(), 'finance.payments') or private.can(auth.uid(), 'finance.expenses')
   or private.can(auth.uid(), 'finance.reports') or private.can(auth.uid(), 'rentals.manage'))
  and private.branch_ok(auth.uid(), branch_id)
);

-- يصدر سند الصرف ويخرج المبلغ من الصندوق (القيد المحاسبي يسجله المستدعي)
create or replace function private.issue_voucher(
  _kind text, _record uuid, _amount numeric, _method public.payment_method,
  _box uuid, _branch uuid, _notes text, _actor uuid
) returns text
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_no text := 'P-' || lpad(nextval('public.finance_voucher_seq')::text, 5, '0');
  v_id uuid;
begin
  insert into public.cash_vouchers
    (voucher_no, kind, rental_record_id, amount, method, cash_account_id, notes, branch_id, created_by)
  values (v_no, _kind, _record, _amount, _method, _box, _notes, _branch, _actor)
  returning id into v_id;

  insert into public.cash_transactions
    (account_id, direction, amount, occurred_at, source, source_id, description, created_by, method)
  values (_box, 'out', _amount, current_date, 'voucher', v_id,
          'سند صرف ' || v_no || coalesce(' — ' || _notes, ''), _actor, _method);
  return v_no;
end $$;

revoke all on function private.issue_voucher(text, uuid, numeric, public.payment_method, uuid, uuid, text, uuid) from public;

-- ===== 6) الحجز مع العربون =====
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
  p_method public.payment_method default 'cash'
) returns uuid
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_branch uuid;
  v_code text;
  v_rec uuid;
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

  insert into public.rental_records
    (dress_id, client_name, client_phone, out_date, due_date, amount, deposit_amount, notes,
     branch_id, created_by, tracks_money)
  values
    (p_dress_id, btrim(p_client_name), nullif(btrim(coalesce(p_client_phone, '')), ''), p_out_date,
     p_due_date, coalesce(p_amount, 0), coalesce(p_deposit_amount, 0), nullif(btrim(coalesce(p_notes, '')), ''),
     v_branch, auth.uid(), true)
  returning id into v_rec;

  if coalesce(p_paid, 0) > 0 then
    insert into public.payments
      (scope, rental_record_id, amount, method, paid_at, notes, cash_account_id, branch_id, created_by, is_deposit)
    values
      ('rental', v_rec, p_paid, p_method, current_date, 'عربون حجز فستان ' || v_code,
       private.method_box(v_branch, p_method), v_branch, auth.uid(), true);
  end if;

  return v_rec;
end $$;

revoke all on function public.book_rental(uuid, text, text, date, date, numeric, numeric, text, numeric, public.payment_method) from public, anon;
grant execute on function public.book_rental(uuid, text, text, date, date, numeric, numeric, text, numeric, public.payment_method) to authenticated;

-- ===== 7) تسليم الفستان للعميلة =====
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
  select code into v_code from public.rental_dresses where id = r.dress_id;

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

revoke all on function public.deliver_rental(uuid, numeric, public.payment_method, numeric, public.payment_method) from public, anon;
grant execute on function public.deliver_rental(uuid, numeric, public.payment_method, numeric, public.payment_method) to authenticated;

-- ===== 8) الإرجاع ورد التأمين =====
drop function if exists public.close_rental_return(uuid, text, numeric, text);

create or replace function public.close_rental_return(
  p_record_id uuid,
  p_condition text default 'available',
  p_damage numeric default 0,
  p_note text default null,
  p_method public.payment_method default null
) returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  r public.rental_records;
  v_code text;
  v_held numeric;
  v_damage numeric;
  v_refund numeric;
  v_method public.payment_method;
  v_box uuid;
  v_shop uuid;
  v_lines jsonb;
  v_entry uuid;
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
  select code into v_code from public.rental_dresses where id = r.dress_id;

  v_held := greatest(r.deposit_paid - r.deposit_refunded - r.damage_amount, 0);
  v_damage := least(greatest(coalesce(p_damage, 0), 0), v_held);
  v_refund := v_held - v_damage;
  v_method := coalesce(p_method, r.deposit_method, 'cash');

  update public.rental_records
     set returned_at = now(),
         return_condition = coalesce(nullif(btrim(coalesce(p_condition, '')), ''), 'available'),
         damage_amount = r.damage_amount + v_damage,
         deposit_refunded = r.deposit_refunded + v_refund,
         notes = case
           when nullif(btrim(coalesce(p_note, '')), '') is null then notes
           else concat_ws(E'\n', notes, 'عند الإرجاع: ' || btrim(p_note)) end
   where id = r.id;

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
end $$;

revoke all on function public.close_rental_return(uuid, text, numeric, text, public.payment_method) from public, anon;
grant execute on function public.close_rental_return(uuid, text, numeric, text, public.payment_method) to authenticated;

-- ===== 9) طلب إلغاء الحجز وقرار المدير =====
create or replace function public.request_rental_cancel(p_record_id uuid, p_reason text default null)
returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  r public.rental_records;
  v_code text;
  v_uid uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
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
    raise exception 'الحجز ملغي مسبقًا';
  end if;
  if r.delivered_at is not null or r.returned_at is not null then
    raise exception 'الفستان تسلّم للعميلة — سجّل الإرجاع بدل الإلغاء';
  end if;
  if r.cancel_requested_at is not null then
    raise exception 'فيه طلب إلغاء قائم لهذا الحجز';
  end if;

  update public.rental_records
     set cancel_requested_at = now(), cancel_requested_by = auth.uid(), cancel_reason = v_reason
   where id = r.id;

  select code into v_code from public.rental_dresses where id = r.dress_id;
  for v_uid in
    select p.id from public.profiles p
     where p.is_active and p.id <> auth.uid() and private.can(p.id, 'rentals.cancel')
  loop
    insert into public.notifications (user_id, kind, message)
    values (v_uid, 'rental_cancel',
            'طلب إلغاء حجز فستان ' || coalesce(v_code, '') || ' للعميلة ' || r.client_name
            || coalesce(' — ' || v_reason, ''));
  end loop;
end $$;

revoke all on function public.request_rental_cancel(uuid, text) from public, anon;
grant execute on function public.request_rental_cancel(uuid, text) to authenticated;

-- p_cancel = false: رفض الطلب ويبقى الحجز قائمًا
create or replace function public.decide_rental_cancel(
  p_record_id uuid,
  p_cancel boolean,
  p_refund numeric default 0,
  p_method public.payment_method default 'cash',
  p_note text default null
) returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  r public.rental_records;
  v_code text;
  v_paid numeric;
  v_refund numeric := coalesce(p_refund, 0);
  v_kept numeric;
  v_box uuid;
  v_lines jsonb := '[]'::jsonb;
  v_entry uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not private.can(auth.uid(), 'rentals.cancel') then
    raise exception 'قرار إلغاء الحجز ليس ضمن صلاحياتك';
  end if;
  select * into r from public.rental_records where id = p_record_id for update;
  if r.id is null then
    raise exception 'الحجز غير موجود';
  end if;
  if not private.branch_ok(auth.uid(), r.branch_id) then
    raise exception 'غير مصرح';
  end if;
  if r.cancelled_at is not null then
    raise exception 'الحجز ملغي مسبقًا';
  end if;
  select code into v_code from public.rental_dresses where id = r.dress_id;

  if not p_cancel then
    update public.rental_records
       set cancel_requested_at = null, cancel_requested_by = null, cancel_reason = null
     where id = r.id;
    if r.cancel_requested_by is not null and r.cancel_requested_by <> auth.uid() then
      insert into public.notifications (user_id, kind, message)
      values (r.cancel_requested_by, 'rental_cancel',
              'رُفض طلب إلغاء حجز فستان ' || coalesce(v_code, '') || ' للعميلة ' || r.client_name
              || ' — الحجز باقٍ' || coalesce(' (' || v_note || ')', ''));
    end if;
    return;
  end if;

  if r.delivered_at is not null or r.returned_at is not null then
    raise exception 'الفستان تسلّم للعميلة — سجّل الإرجاع بدل الإلغاء';
  end if;

  select coalesce(sum(amount), 0) into v_paid
    from public.payments where rental_record_id = r.id and not is_security_deposit;
  if v_refund < 0 or v_refund > v_paid then
    raise exception 'المبلغ المرجّع لازم يكون بين صفر و%', v_paid;
  end if;
  v_kept := v_paid - v_refund;

  if v_refund > 0 then
    v_box := private.method_box(r.branch_id, p_method);
    if v_box is null then
      raise exception 'ما فيه صندوق للفرع يُصرف منه المبلغ';
    end if;
    perform private.issue_voucher('cancel_refund', r.id, v_refund, p_method, v_box, r.branch_id,
      'رد مبلغ إلغاء حجز فستان ' || coalesce(v_code, '') || ' — ' || r.client_name, auth.uid());
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('code', '2110', 'debit', v_refund, 'credit', 0, 'memo', 'رد مبلغ إلغاء حجز'),
      jsonb_build_object('code', private.box_gl(v_box), 'debit', 0, 'credit', v_refund)
    );
  end if;
  if v_kept > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('code', '2110', 'debit', v_kept, 'credit', 0),
      jsonb_build_object('code', '4210', 'debit', 0, 'credit', v_kept, 'memo', 'إيراد إلغاء حجز')
    );
  end if;
  if jsonb_array_length(v_lines) > 0 then
    v_entry := private.post_entry(current_date,
      'إلغاء حجز فستان ' || coalesce(v_code, '') || ' — ' || r.client_name,
      'rental_cancel', r.id, v_lines, auth.uid());
    perform private.post_entry_branch(v_entry, r.branch_id);
  end if;

  update public.rental_records
     set cancelled_at = now(),
         cancelled_by = auth.uid(),
         cancel_refund = v_refund,
         cancel_kept = v_kept,
         notes = case when v_note is null then notes
                      else concat_ws(E'\n', notes, 'قرار الإلغاء: ' || v_note) end
   where id = r.id;

  if r.cancel_requested_by is not null and r.cancel_requested_by <> auth.uid() then
    insert into public.notifications (user_id, kind, message)
    values (r.cancel_requested_by, 'rental_cancel',
            'تم إلغاء حجز فستان ' || coalesce(v_code, '') || ' للعميلة ' || r.client_name
            || ' — رجع لها ' || v_refund::text || ' وبقي للمحل ' || v_kept::text);
  end if;
end $$;

revoke all on function public.decide_rental_cancel(uuid, boolean, numeric, public.payment_method, text) from public, anon;
grant execute on function public.decide_rental_cancel(uuid, boolean, numeric, public.payment_method, text) to authenticated;

-- ===== 10) طلبات «تفصيل إيجار»: التأمين يُقبض عند التسليم في صندوق التأمينات =====
drop function if exists public.deliver_rental_order(uuid, date);

CREATE OR REPLACE FUNCTION public.deliver_rental_order(
  p_order_id uuid,
  p_due_date date DEFAULT NULL,
  p_deposit_paid numeric DEFAULT NULL,
  p_deposit_method public.payment_method DEFAULT 'cash'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_order public.orders;
  v_dress uuid;
  v_branch uuid;
  v_code text;
  v_rec uuid;
  v_deposit numeric;
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

  if v_dress is null then
    insert into public.rental_dresses (
      code, model_no, size, color, rent_price, deposit_amount, status,
      notes, branch_id, source_order_id, created_by
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
      auth.uid()
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

revoke all on function public.deliver_rental_order(uuid, date, numeric, public.payment_method) from public, anon;
grant execute on function public.deliver_rental_order(uuid, date, numeric, public.payment_method) to authenticated;
