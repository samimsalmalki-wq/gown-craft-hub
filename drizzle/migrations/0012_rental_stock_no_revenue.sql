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
  select coalesce(sum(amount), 0) into v_paid from public.payments where order_id = new.id;
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