ALTER TABLE public.order_stages
  ADD COLUMN IF NOT EXISTS is_required boolean NOT NULL DEFAULT true;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS scope_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS scope_set_by uuid REFERENCES public.profiles(id);

ALTER TABLE public.stage_templates
  ADD COLUMN IF NOT EXISTS is_scope_gate boolean NOT NULL DEFAULT false;

UPDATE public.stage_templates t
   SET is_scope_gate = true
 WHERE t.id = (
   SELECT id FROM public.stage_templates WHERE is_active ORDER BY position OFFSET 5 LIMIT 1
 )
 AND NOT EXISTS (SELECT 1 FROM public.stage_templates WHERE is_scope_gate);

CREATE OR REPLACE FUNCTION public.set_order_stage_scope(p_order_id uuid, p_stages text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_gate int;
  v_count int;
begin
  if not (private.has_role(auth.uid(), 'admin') or private.has_role(auth.uid(), 'supervisor')) then
    raise exception 'غير مصرح';
  end if;

  select position into v_gate
    from public.stage_templates
   where is_scope_gate and is_active
   order by position
   limit 1;

  if v_gate is null then
    select min(position) + 5 into v_gate from public.stage_templates where is_active;
  end if;

  update public.order_stages s
     set is_required = (s.stage = any(coalesce(p_stages, '{}'::text[])))
   where s.order_id = p_order_id
     and s.position > v_gate
     and s.status <> 'done';

  update public.order_stages s
     set is_required = true
   where s.order_id = p_order_id
     and s.status = 'done'
     and s.is_required = false;

  select count(*) into v_count
    from public.order_stages
   where order_id = p_order_id and position > v_gate and is_required;

  update public.orders
     set scope_set_at = now(),
         scope_set_by = auth.uid()
   where id = p_order_id;

  perform private.log_activity(p_order_id, null, 'scope_set',
    'تحديد المراحل المطلوبة: ' || v_count::text || ' مرحلة');
end $$;

REVOKE ALL ON FUNCTION public.set_order_stage_scope(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_order_stage_scope(uuid, text[]) TO authenticated;