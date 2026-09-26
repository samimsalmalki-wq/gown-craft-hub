-- إصلاحات المالية
--  1) فواتير التفصيل والإيجار شاملة الضريبة (مثل فواتير البيع)، ولا تُسجّل الإيراد مرة ثانية:
--     الإيراد يُسجَّل عند التسليم من الدفعات، والفاتورة تفصل ضريبة القيمة المضافة منه فقط.
--  2) إلغاء فاتورة صادرة يعكس قيدها.
--  3) تصحيح قيود الفواتير السابقة التي كررت الإيراد، وربط قيود الفواتير بالفرع.
--  4) مجاميع الحسابات وأرصدة الصناديق تُحسب في قاعدة البيانات (لا تنقطع عند 1000 سطر).
--  5) التحويل بين الصناديق.

-- ===== 1) مجاميع الفاتورة: السعر شامل الضريبة لكل الفواتير =====
create or replace function public.recalc_invoice_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice uuid := coalesce(new.invoice_id, old.invoice_id);
  v_incl numeric;
  v_sub numeric;
  v_rate numeric;
  v_taxable boolean;
begin
  select vat_rate, is_taxable into v_rate, v_taxable
    from public.invoices where id = v_invoice;

  select coalesce(sum(qty * coalesce(unit_price_incl, unit_price)), 0) into v_incl
    from public.invoice_lines where invoice_id = v_invoice;
  v_incl := round(v_incl, 2);
  v_sub := case when v_taxable then round(v_incl * 100 / (100 + coalesce(v_rate, 0)), 2) else v_incl end;

  update public.invoices
     set subtotal = v_sub, tax_amount = v_incl - v_sub, total = v_incl
   where id = v_invoice;
  return coalesce(new, old);
end $$;

create or replace function public.recalc_invoice_on_tax()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_incl numeric;
begin
  select coalesce(sum(qty * coalesce(unit_price_incl, unit_price)), 0) into v_incl
    from public.invoice_lines where invoice_id = new.id;
  v_incl := round(v_incl, 2);
  new.total := v_incl;
  new.subtotal := case when new.is_taxable
    then round(v_incl * 100 / (100 + coalesce(new.vat_rate, 0)), 2) else v_incl end;
  new.tax_amount := new.total - new.subtotal;
  return new;
end $$;

-- ===== 2) عكس قيود مصدر معيّن (لإلغاء الفاتورة) =====
create or replace function private.reverse_source_entries(
  _sources text[], _source_id uuid, _memo text, _new_source text
) returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  e record;
  v_lines jsonb;
  v_entry uuid;
begin
  for e in
    select id, branch_id from public.journal_entries
     where source = any(_sources) and source_id = _source_id
  loop
    select jsonb_agg(jsonb_build_object('code', a.code, 'debit', l.credit, 'credit', l.debit, 'memo', l.memo))
      into v_lines
      from public.journal_lines l
      join public.gl_accounts a on a.id = l.account_id
     where l.entry_id = e.id;
    if v_lines is not null then
      v_entry := private.post_entry(current_date, _memo, _new_source, _source_id, v_lines, auth.uid());
      perform private.post_entry_branch(v_entry, e.branch_id);
    end if;
  end loop;
end $$;

revoke all on function private.reverse_source_entries(text[], uuid, text, text) from public;

-- ===== 3) قيد الفاتورة =====
create or replace function public.post_invoice_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope text := new.scope::text;
  v_revenue text;
  v_lines jsonb;
  v_entry uuid;
begin
  -- إلغاء فاتورة صادرة: عكس كل قيودها
  if new.status = 'cancelled' and old.status = 'issued' then
    perform private.reverse_source_entries(
      array['invoice', 'invoice_fix'], new.id, 'إلغاء فاتورة ' || new.invoice_no, 'invoice_cancel');
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
    -- التفصيل والإيجار: الإيراد يُسجَّل عند التسليم، والفاتورة تفصل الضريبة منه فقط
    v_revenue := case when v_scope = 'rental' then '4210' else '4110' end;
    v_entry := private.post_entry(new.issue_date, 'ضريبة فاتورة ' || new.invoice_no,
      'invoice', new.id,
      jsonb_build_array(
        jsonb_build_object('code', v_revenue, 'debit', new.tax_amount, 'credit', 0,
                           'memo', 'ضريبة القيمة المضافة من الإيراد'),
        jsonb_build_object('code', '2210', 'debit', 0, 'credit', new.tax_amount)
      ),
      new.created_by);
  end if;

  perform private.post_entry_branch(v_entry, new.branch_id);
  return new;
end $$;

-- ===== 4) تصحيح الفواتير السابقة =====
-- قيد الفاتورة القديم كان: مدين الذمة (1210/1220) / دائن الإيراد + الضريبة، مع أن الإيراد سُجّل عند التسليم.
-- التصحيح: مدين الإيراد / دائن الذمة بنفس المبلغ، فتنقفل الذمة الوهمية ويبقى الإيراد مرة واحدة.
do $$
declare
  r record;
  v_entry uuid;
begin
  for r in
    select i.id, i.invoice_no, i.branch_id, i.scope::text as scope, i.status::text as status,
           a.code as receivable, sum(l.debit) as amount
      from public.invoices i
      join public.journal_entries e on e.source = 'invoice' and e.source_id = i.id
      join public.journal_lines l on l.entry_id = e.id
      join public.gl_accounts a on a.id = l.account_id
     where i.scope::text in ('order', 'rental')
       and a.code in ('1210', '1220')
       and l.debit > 0
       and not exists (select 1 from public.journal_entries x
                        where x.source in ('invoice_fix', 'invoice_cancel') and x.source_id = i.id)
     group by i.id, i.invoice_no, i.branch_id, i.scope, i.status, a.code
  loop
    if r.status = 'cancelled' then
      -- فاتورة أُلغيت دون عكس قيدها: نعكسه كاملًا
      perform private.reverse_source_entries(
        array['invoice'], r.id, 'إلغاء فاتورة ' || r.invoice_no, 'invoice_cancel');
    else
      v_entry := private.post_entry(current_date,
        'تصحيح قيد فاتورة ' || r.invoice_no || ' (الإيراد مسجّل عند التسليم)',
        'invoice_fix', r.id,
        jsonb_build_array(
          jsonb_build_object('code', case when r.scope = 'rental' then '4210' else '4110' end,
                             'debit', r.amount, 'credit', 0),
          jsonb_build_object('code', r.receivable, 'debit', 0, 'credit', r.amount)
        ),
        null);
      perform private.post_entry_branch(v_entry, r.branch_id);
    end if;
  end loop;
end $$;

-- قيود الفواتير تحمل فرع الفاتورة
update public.journal_entries e
   set branch_id = i.branch_id
  from public.invoices i
 where e.source in ('invoice', 'invoice_fix', 'invoice_cancel')
   and e.source_id = i.id
   and e.branch_id is null
   and i.branch_id is not null;

-- ===== 5) المجاميع من قاعدة البيانات (تحترم صلاحيات القراءة) =====
create or replace function public.finance_account_totals(
  p_from date default null, p_to date default null, p_branch uuid default null
) returns table (account_id uuid, debit numeric, credit numeric)
    language sql stable security invoker
    set search_path to 'public'
    as $$
  select l.account_id, coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0)
    from public.journal_lines l
    join public.journal_entries e on e.id = l.entry_id
   where (p_from is null or e.entry_date >= p_from)
     and (p_to is null or e.entry_date <= p_to)
     and (p_branch is null or e.branch_id = p_branch)
   group by l.account_id
$$;

grant execute on function public.finance_account_totals(date, date, uuid) to authenticated;

create or replace function public.cash_box_totals(p_branch uuid default null)
returns table (account_id uuid, total_in numeric, total_out numeric)
    language sql stable security invoker
    set search_path to 'public'
    as $$
  select t.account_id,
         coalesce(sum(case when t.direction = 'in' then t.amount else 0 end), 0),
         coalesce(sum(case when t.direction = 'out' then t.amount else 0 end), 0)
    from public.cash_transactions t
    join public.cash_accounts a on a.id = t.account_id
   where p_branch is null or a.branch_id = p_branch
   group by t.account_id
$$;

grant execute on function public.cash_box_totals(uuid) to authenticated;

-- ===== 6) التحويل بين الصناديق (مثل إيداع كاش الصندوق في البنك) =====
create or replace function public.transfer_cash(
  p_from uuid, p_to uuid, p_amount numeric, p_date date default current_date, p_note text default null
) returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  a public.cash_accounts;
  b public.cash_accounts;
  v_id uuid := gen_random_uuid();
  v_desc text;
  v_entry uuid;
begin
  if not private.can(auth.uid(), 'finance.expenses') then
    raise exception 'غير مصرح';
  end if;
  if p_from = p_to then
    raise exception 'اختر صندوقين مختلفين';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'المبلغ يجب أن يكون أكبر من صفر';
  end if;
  select * into a from public.cash_accounts where id = p_from;
  select * into b from public.cash_accounts where id = p_to;
  if a.id is null or b.id is null then
    raise exception 'الصندوق غير موجود';
  end if;
  if a.is_deposit_box or b.is_deposit_box then
    raise exception 'صندوق التأمينات لأمانات العميلات فقط، ولا يُحوَّل منه أو إليه';
  end if;
  if not (private.branch_ok(auth.uid(), a.branch_id) and private.branch_ok(auth.uid(), b.branch_id)) then
    raise exception 'غير مصرح';
  end if;

  v_desc := 'تحويل من ' || a.name || ' إلى ' || b.name
            || coalesce(' — ' || nullif(btrim(coalesce(p_note, '')), ''), '');

  insert into public.cash_transactions
    (account_id, direction, amount, occurred_at, source, source_id, description, created_by)
  values
    (a.id, 'out', p_amount, coalesce(p_date, current_date), 'transfer', v_id, v_desc, auth.uid()),
    (b.id, 'in', p_amount, coalesce(p_date, current_date), 'transfer', v_id, v_desc, auth.uid());

  if a.gl_code is distinct from b.gl_code then
    v_entry := private.post_entry(coalesce(p_date, current_date), v_desc, 'transfer', v_id,
      jsonb_build_array(
        jsonb_build_object('code', b.gl_code, 'debit', p_amount, 'credit', 0),
        jsonb_build_object('code', a.gl_code, 'debit', 0, 'credit', p_amount)
      ),
      auth.uid());
    perform private.post_entry_branch(v_entry, a.branch_id);
  end if;
end $$;

revoke all on function public.transfer_cash(uuid, uuid, numeric, date, text) from public, anon;
grant execute on function public.transfer_cash(uuid, uuid, numeric, date, text) to authenticated;
