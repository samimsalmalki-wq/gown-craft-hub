-- ما ينسلّم الطلب للعميلة وعليها مبلغ متبقي:
--  • إنهاء آخر مرحلة مطلوبة (وهو التسليم للعميلة) ينرفض لو قيمة الطلب أكبر من المدفوع
--  • وتحويل الطلب إلى «مُسلَّم» بأي طريق ينرفض كذلك (لوحة الإنتاج، تسليم طلب الإيجار…)
--  • «إنتاج للإيجار» ما له عميلة، فما يدخل في المنع
-- الحل: تسجيل سند قبض بالمتبقي، أو تعديل قيمة الطلب لو فيه خصم.
-- آمن لو انعاد تشغيله.

begin;

-- المتبقي على العميلة (صفر لطلب الإنتاج للإيجار)
create or replace function private.order_due(_order uuid) returns numeric
    language sql stable security definer
    set search_path to 'public'
    as $$
  select coalesce((
    select greatest(coalesce(o.total_amount, 0) - coalesce(o.deposit_amount, 0), 0)
      from public.orders o
     where o.id = _order and o.order_kind <> 'rental_stock'
  ), 0)
$$;

revoke all on function private.order_due(uuid) from public;
grant execute on function private.order_due(uuid) to authenticated, service_role;

create or replace function private.guard_delivery_stage() returns trigger
    language plpgsql
    set search_path to 'public'
    as $$
declare v_loc text;
begin
  if new.status::text in ('done', 'review') and old.status::text not in ('done', 'review') then
    if private.open_alteration_blocks(new.order_id, new.id, new.stage::text) then
      raise exception 'فيه تعديل مفتوح على الطلب — المرحلة تكمل بعد ما تقبل العميلة التعديل';
    end if;
    select dress_location into v_loc from public.orders where id = new.order_id;
    if private.is_fitting_trip_stage(new.order_id, new.stage::text) then
      -- مرحلة الإرسال للبروفة تنتهي باستلام الفرع للقطعة
      if v_loc in ('workshop', 'transit') then
        raise exception 'قطعة البروفة للحين % — المرحلة تنتهي لما يؤكّد الفرع الاستلام',
          case v_loc when 'workshop' then 'في المعمل، أرسلها من المخزون' else 'في الطريق للفرع' end;
      end if;
    elsif v_loc = 'fitting' then
      raise exception 'قطعة البروفة للحين في الفرع — سجّل نتيجة البروفة وأرجعها للمعمل أول';
    end if;
    if new.stage::text = private.last_required_stage(new.order_id) then
      if v_loc in ('workshop', 'transit', 'returning') then
        raise exception 'الفستان للحين % — أرسله من المعمل وأكّد استلامه في الفرع قبل التسليم',
          case v_loc when 'workshop' then 'في المعمل'
                     when 'transit' then 'في الطريق للفرع'
                     else 'في الطريق للمعمل' end;
      end if;
      -- آخر مرحلة هي التسليم للعميلة: ما تكمل وعليها مبلغ متبقي
      if private.order_due(new.order_id) > 0 then
        raise exception 'على العميلة مبلغ متبقي — ما ينسلّم الطلب قبل ما يكتمل الدفع. سجّل سند القبض بالمتبقي أول';
      end if;
    end if;
  end if;
  return new;
end $$;

create or replace function private.guard_order_delivery() returns trigger
    language plpgsql
    set search_path to 'public'
    as $$
begin
  if new.state = 'delivered' and old.state <> 'delivered' then
    if old.dress_location in ('workshop', 'transit', 'fitting', 'returning') then
      raise exception '%', case old.dress_location
        when 'workshop' then 'الفستان للحين في المعمل — أرسله من المعمل وأكّد استلامه في الفرع قبل التسليم'
        when 'transit' then 'الفستان للحين في الطريق للفرع — أكّد استلامه في الفرع قبل التسليم'
        when 'fitting' then 'قطعة البروفة للحين في الفرع — سجّل نتيجة البروفة وأرجعها للمعمل أول'
        else 'القطعة في الطريق للمعمل — ما ينسلّم الطلب قبل ما يكمل'
      end;
    end if;
    if new.order_kind <> 'rental_stock'
       and coalesce(new.total_amount, 0) - coalesce(new.deposit_amount, 0) > 0 then
      raise exception 'على العميلة مبلغ متبقي — ما ينسلّم الطلب قبل ما يكتمل الدفع. سجّل سند القبض بالمتبقي أول';
    end if;
  end if;
  return new;
end $$;

commit;
