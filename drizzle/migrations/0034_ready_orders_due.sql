-- المتبقي على العميلة عند التسليم من شاشة المخزون:
--  • total_amount و paid_amount لمن عنده «عرض المبالغ» (finance.view)، وإلا فاضية
--  • has_due دايمًا: عليها مبلغ متبقي أو لا، عشان ينبّه الموظف قبل التسليم
-- آمن لو انعاد تشغيله.

begin;

drop function if exists public.ready_orders();
create function public.ready_orders()
returns table (
  id uuid,
  order_no text,
  client_name text,
  client_phone text,
  branch_id uuid,
  order_kind public.order_kind,
  event_date date,
  due_date date,
  parts text[],
  dress_location text,
  for_fitting boolean,
  total_amount numeric,
  paid_amount numeric,
  has_due boolean
)
    language sql stable security definer
    set search_path to 'public'
    as $$
  select o.id, o.order_no, o.client_name, o.client_phone, o.branch_id, o.order_kind,
         o.event_date, o.due_date, o.parts, o.dress_location,
         o.dress_location in ('fitting', 'returning')
           or private.is_fitting_trip_stage(o.id, o.current_stage::text),
         case when private.can(auth.uid(), 'finance.view') then o.total_amount end,
         case when private.can(auth.uid(), 'finance.view') then o.deposit_amount end,
         o.total_amount - o.deposit_amount > 0
    from public.orders o
   where o.state = 'active'
     and o.dress_location in ('workshop', 'transit', 'branch', 'fitting', 'returning')
     and (private.can(auth.uid(), 'goods.transfer') or private.can(auth.uid(), 'orders.view_all'))
     and private.goods_place_ok(auth.uid(), o.branch_id, o.dress_location in ('workshop', 'returning'))
   order by o.due_date nulls last, o.order_no
$$;

revoke all on function public.ready_orders() from public, anon;
grant execute on function public.ready_orders() to authenticated;

commit;
