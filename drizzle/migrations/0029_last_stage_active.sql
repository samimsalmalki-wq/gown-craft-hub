-- آخر مرحلة في الطلب (التسليم للعميلة) تتجاهل المراحل الموقوفة في إعداد المراحل
-- (الطلبات القديمة فيها مراحل انوقفت بعدين، مثل التصميم وأخذ المقاسات، وترتيبها في الآخر)
create or replace function private.last_required_stage(_order uuid) returns text
    language sql stable security definer
    set search_path to 'public'
    as $$
  select s.stage::text
    from public.order_stages s
    left join public.stage_templates t on t.stage::text = s.stage::text
   where s.order_id = _order and s.is_required and coalesce(t.is_active, true)
   order by s.position desc
   limit 1
$$;

revoke all on function private.last_required_stage(uuid) from public;
grant execute on function private.last_required_stage(uuid) to authenticated, service_role;
