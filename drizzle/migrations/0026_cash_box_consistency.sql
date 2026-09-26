-- مطابقة الصناديق مع الحسابات
--  1) أي سند قبض أو مصروف بدون صندوق يذهب تلقائيًا لصندوق الفرع حسب طريقة الدفع
--     (كان زر «سداد المتبقي» في الطلب يسجّل السند بدون صندوق، فيدخل الحسابات ولا يدخل أي صندوق).
--  2) الرصيد الافتتاحي للصندوق يُقيَّد في الحسابات مقابل رأس المال، وكل تعديل عليه يُقيَّد بفرقه.

-- ===== 1) الصندوق الافتراضي =====
create or replace function private.default_payment_box() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
begin
  if new.cash_account_id is null then
    new.cash_account_id := case
      when new.is_security_deposit then private.deposit_box(new.branch_id)
      else private.method_box(new.branch_id, new.method)
    end;
  end if;
  return new;
end $$;

revoke all on function private.default_payment_box() from public;

drop trigger if exists payments_default_box on public.payments;
create trigger payments_default_box before insert on public.payments
  for each row execute function private.default_payment_box();

create or replace function private.default_expense_box() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
begin
  if new.cash_account_id is null then
    new.cash_account_id := private.method_box(new.branch_id, 'cash');
  end if;
  return new;
end $$;

revoke all on function private.default_expense_box() from public;

drop trigger if exists expenses_default_box on public.expenses;
create trigger expenses_default_box before insert on public.expenses
  for each row execute function private.default_expense_box();

-- ===== 2) الرصيد الافتتاحي في الحسابات =====
create or replace function private.post_box_opening_balance() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_delta numeric := coalesce(new.opening_balance, 0)
                     - case when tg_op = 'UPDATE' then coalesce(old.opening_balance, 0) else 0 end;
  v_entry uuid;
begin
  if round(v_delta, 2) = 0 then
    return new;
  end if;
  v_entry := private.post_entry(current_date,
    case when tg_op = 'INSERT' then 'رصيد افتتاحي — ' else 'تعديل الرصيد الافتتاحي — ' end || new.name,
    'opening_balance', new.id,
    jsonb_build_array(
      jsonb_build_object('code', coalesce(new.gl_code, '1110'),
                         'debit', greatest(v_delta, 0), 'credit', greatest(-v_delta, 0)),
      jsonb_build_object('code', '3100',
                         'debit', greatest(-v_delta, 0), 'credit', greatest(v_delta, 0))
    ),
    auth.uid());
  perform private.post_entry_branch(v_entry, new.branch_id);
  return new;
end $$;

revoke all on function private.post_box_opening_balance() from public;

drop trigger if exists cash_accounts_opening_entry on public.cash_accounts;
create trigger cash_accounts_opening_entry after insert or update of opening_balance on public.cash_accounts
  for each row execute function private.post_box_opening_balance();

-- الأرصدة الافتتاحية الحالية التي لم تُقيَّد
do $$
declare
  a record;
  v_entry uuid;
begin
  for a in
    select * from public.cash_accounts c
     where round(c.opening_balance, 2) <> 0
       and not exists (select 1 from public.journal_entries e
                        where e.source = 'opening_balance' and e.source_id = c.id)
  loop
    v_entry := private.post_entry(current_date, 'رصيد افتتاحي — ' || a.name, 'opening_balance', a.id,
      jsonb_build_array(
        jsonb_build_object('code', coalesce(a.gl_code, '1110'),
                           'debit', greatest(a.opening_balance, 0), 'credit', greatest(-a.opening_balance, 0)),
        jsonb_build_object('code', '3100',
                           'debit', greatest(-a.opening_balance, 0), 'credit', greatest(a.opening_balance, 0))
      ),
      null);
    perform private.post_entry_branch(v_entry, a.branch_id);
  end loop;
end $$;

-- ===== 3) توقيت الإيراد والضريبة في الطلبات =====
--  • الدفعة بعد تسليم الطلب إيراد مباشرة (كانت تبقى دفعة مقدمة للأبد).
--  • إيراد التسليم = المدفوع − ضريبة الفواتير الصادرة للطلب، ويُقيَّد على فرع الطلب.
--  • ضريبة فاتورة الطلب قبل التسليم تُفصل من الدفعة المقدمة لا من الإيراد (فلا يصير إيراد الشهر سالبًا).
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
    -- قبل تسليم الطلب دفعة مقدمة، وبعده إيراد تفصيل
    select state = 'delivered' into v_delivered from public.orders where id = new.order_id;
    v_credit := case when coalesce(v_delivered, false) then '4110' else '2110' end;
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

create or replace function public.recognize_order_revenue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paid numeric;
  v_tax numeric;
  v_amount numeric;
  v_entry uuid;
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
  -- ضريبة الفواتير الصادرة قبل التسليم فُصلت من الدفعة المقدمة
  select coalesce(sum(tax_amount), 0) into v_tax
    from public.invoices where order_id = new.id and status = 'issued' and scope::text = 'order';
  v_amount := round(v_paid - v_tax, 2);
  if v_amount = 0 then
    return new;
  end if;

  v_entry := private.post_entry(current_date,
    'إثبات إيراد تسليم الطلب ' || new.order_no,
    'order_delivered', new.id,
    case when v_amount > 0 then jsonb_build_array(
      jsonb_build_object('code', '2110', 'debit', v_amount, 'credit', 0),
      jsonb_build_object('code', '4110', 'debit', 0, 'credit', v_amount))
    else jsonb_build_array(
      jsonb_build_object('code', '4110', 'debit', -v_amount, 'credit', 0),
      jsonb_build_object('code', '2110', 'debit', 0, 'credit', -v_amount))
    end,
    new.created_by);
  perform private.post_entry_branch(v_entry, new.branch_id);
  return new;
end $$;

create or replace function public.post_invoice_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope text := new.scope::text;
  v_revenue text := case when new.scope::text = 'rental' then '4210' else '4110' end;
  v_delivered boolean := true;
  v_side text;
  v_lines jsonb;
  v_entry uuid;
begin
  -- الطلب لم يُسلَّم بعد: الضريبة تُفصل من الدفعة المقدمة (الإيجار يُفصل من الإيراد دائمًا)
  if v_scope = 'order' and new.order_id is not null then
    select coalesce(state = 'delivered', true) into v_delivered from public.orders where id = new.order_id;
  end if;
  v_side := case when v_delivered then v_revenue else '2110' end;

  -- إلغاء فاتورة صادرة
  if new.status = 'cancelled' and old.status = 'issued' then
    if v_scope = 'sale' or exists (
      select 1
        from public.journal_entries e
        join public.journal_lines l on l.entry_id = e.id
        join public.gl_accounts a on a.id = l.account_id
       where e.source = 'invoice' and e.source_id = new.id and a.code in ('1210', '1220')
    ) then
      -- البيع والقيود القديمة: عكس القيد كما هو
      perform private.reverse_source_entries(
        array['invoice', 'invoice_fix'], new.id, 'إلغاء فاتورة ' || new.invoice_no, 'invoice_cancel');
    elsif new.tax_amount > 0 then
      -- ترجع الضريبة لمكانها الحالي: الدفعة المقدمة قبل التسليم، والإيراد بعده
      v_entry := private.post_entry(current_date, 'إلغاء فاتورة ' || new.invoice_no,
        'invoice_cancel', new.id,
        jsonb_build_array(
          jsonb_build_object('code', '2210', 'debit', new.tax_amount, 'credit', 0),
          jsonb_build_object('code', v_side, 'debit', 0, 'credit', new.tax_amount)
        ),
        auth.uid());
      perform private.post_entry_branch(v_entry, new.branch_id);
    end if;
    return new;
  end if;

  if new.status <> 'issued' or old.status = 'issued' then
    return new;
  end if;

  if v_scope = 'sale' then
    -- البيع: الفاتورة تُثبت الإيراد والذمة، والدفعات تسدد الذمة
    v_lines := jsonb_build_array(
      jsonb_build_object('code', '1230', 'debit', new.total, 'credit', 0),
      jsonb_build_object('code', '4310', 'debit', 0, 'credit', new.subtotal)
    );
    if new.tax_amount > 0 then
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object('code', '2210', 'debit', 0, 'credit', new.tax_amount));
    end if;
    v_entry := private.post_entry(new.issue_date, 'فاتورة ' || new.invoice_no,
      'invoice', new.id, v_lines, new.created_by);
  elsif new.tax_amount > 0 then
    v_entry := private.post_entry(new.issue_date, 'ضريبة فاتورة ' || new.invoice_no,
      'invoice', new.id,
      jsonb_build_array(
        jsonb_build_object('code', v_side, 'debit', new.tax_amount, 'credit', 0,
                           'memo', 'ضريبة القيمة المضافة من المبلغ المدفوع'),
        jsonb_build_object('code', '2210', 'debit', 0, 'credit', new.tax_amount)
      ),
      new.created_by);
  end if;

  perform private.post_entry_branch(v_entry, new.branch_id);
  return new;
end $$;
