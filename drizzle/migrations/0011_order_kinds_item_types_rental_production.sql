-- ===== أنواع القطع =====
CREATE TABLE public.item_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  position integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.item_types TO authenticated;
GRANT ALL ON public.item_types TO service_role;

ALTER TABLE public.item_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team reads item types" ON public.item_types
  FOR SELECT TO authenticated USING (private.is_team(auth.uid()));

CREATE POLICY "managers add item types" ON public.item_types
  FOR INSERT TO authenticated WITH CHECK (private.is_manager_or_supervisor(auth.uid()));

CREATE POLICY "managers update item types" ON public.item_types
  FOR UPDATE TO authenticated USING (private.is_manager_or_supervisor(auth.uid()));

-- ===== نوع الطلب: ملك / إيجار / إنتاج للإيجار =====
CREATE TYPE public.order_kind AS ENUM ('own', 'rental', 'rental_stock');

ALTER TABLE public.orders ADD COLUMN order_kind public.order_kind NOT NULL DEFAULT 'own';
ALTER TABLE public.orders ADD COLUMN security_deposit numeric NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN item_type_id uuid REFERENCES public.item_types(id);

ALTER TABLE public.rental_dresses ADD COLUMN source_order_id uuid REFERENCES public.orders(id);
ALTER TABLE public.rental_records ADD COLUMN order_id uuid REFERENCES public.orders(id);
ALTER TABLE public.rental_records ADD COLUMN damage_amount numeric NOT NULL DEFAULT 0;

ALTER TYPE public.rental_dress_status ADD VALUE IF NOT EXISTS 'in_production';

-- ===== دخول فستان الإيجار إلى المخزون =====
CREATE OR REPLACE FUNCTION public.deliver_rental_order(p_order_id uuid, p_due_date date DEFAULT NULL)
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
begin
  if not private.is_team(auth.uid()) then
    raise exception 'غير مصرح';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'الطلب غير موجود';
  end if;
  if v_order.order_kind = 'own' then
    raise exception 'هذا الطلب تفصيل ملك ولا يدخل مخزون الإيجار';
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
      case when v_order.order_kind = 'rental' then 'rented'::public.rental_dress_status
           else 'available'::public.rental_dress_status end,
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
      amount, deposit_amount, notes, branch_id, created_by
    ) values (
      v_dress, p_order_id, v_order.client_name, v_order.client_phone,
      current_date, coalesce(p_due_date, current_date + 7),
      v_order.total_amount, v_order.security_deposit,
      'تسليم طلب تفصيل إيجار ' || v_order.order_no,
      v_branch, auth.uid()
    );
  end if;

  update public.orders
     set state = 'delivered'
   where id = p_order_id and state <> 'delivered';

  perform private.log_activity(p_order_id, null, 'rental_stock_in',
    'دخول الفستان مخزون الإيجار بكود ' || v_code);

  return v_dress;
end $$;

REVOKE ALL ON FUNCTION public.deliver_rental_order(uuid, date) FROM public;
GRANT EXECUTE ON FUNCTION public.deliver_rental_order(uuid, date) TO authenticated;

-- ===== إرجاع الفستان ورد التأمين =====
CREATE OR REPLACE FUNCTION public.close_rental_return(
  p_record_id uuid,
  p_condition text DEFAULT 'ok',
  p_damage numeric DEFAULT 0,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_rec public.rental_records;
  v_damage numeric := greatest(coalesce(p_damage, 0), 0);
  v_deposit numeric;
  v_refund numeric;
  v_entry uuid;
  v_lines jsonb;
begin
  if not private.is_team(auth.uid()) then
    raise exception 'غير مصرح';
  end if;

  select * into v_rec from public.rental_records where id = p_record_id;
  if v_rec.id is null then
    raise exception 'العقد غير موجود';
  end if;
  if v_rec.returned_at is not null then
    raise exception 'العقد مُرجَع مسبقًا';
  end if;

  v_deposit := coalesce(v_rec.deposit_amount, 0);
  if v_damage > v_deposit then
    v_damage := v_deposit;
  end if;
  v_refund := v_deposit - v_damage;

  update public.rental_records
     set returned_at = current_date,
         return_condition = coalesce(p_condition, 'ok'),
         damage_amount = v_damage,
         notes = coalesce(p_note, notes)
   where id = p_record_id;

  if v_deposit > 0 then
    v_lines := jsonb_build_array(
      jsonb_build_object('code', '2120', 'debit', v_deposit, 'credit', 0, 'memo', 'رد تأمين الإيجار')
    );
    if v_refund > 0 then
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object('code', '1110', 'debit', 0, 'credit', v_refund, 'memo', 'مبلغ مُرد للعميلة')
      );
    end if;
    if v_damage > 0 then
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object('code', '4210', 'debit', 0, 'credit', v_damage, 'memo', 'خصم تلف أو تنظيف')
      );
    end if;

    v_entry := private.post_entry(current_date,
      'إرجاع فستان إيجار — عقد ' || v_rec.id::text,
      'rental_return', p_record_id, v_lines, auth.uid());
    perform private.post_entry_branch(v_entry, v_rec.branch_id);
  end if;

  if v_rec.order_id is not null then
    perform private.log_activity(v_rec.order_id, null, 'rental_returned',
      case when v_damage > 0 then 'أُرجع الفستان بخصم تلف' else 'أُرجع الفستان سليمًا' end);
  end if;
end $$;

REVOKE ALL ON FUNCTION public.close_rental_return(uuid, text, numeric, text) FROM public;
GRANT EXECUTE ON FUNCTION public.close_rental_return(uuid, text, numeric, text) TO authenticated;