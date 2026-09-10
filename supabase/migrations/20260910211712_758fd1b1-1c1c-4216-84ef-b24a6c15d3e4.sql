CREATE OR REPLACE FUNCTION public.reorder_stage_templates(p_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
begin
  if not private.has_role(auth.uid(), 'admin') then
    raise exception 'غير مصرح';
  end if;

  update public.stage_templates t
     set position = i.ord
    from (
      select id, ord from unnest(p_ids) with ordinality as u(id, ord)
    ) i
   where t.id = i.id;

  perform private.sync_order_stages();
end $$;

CREATE OR REPLACE FUNCTION public.add_stage_template(
  p_label text,
  p_expected_days integer DEFAULT 2,
  p_requires_review boolean DEFAULT false
)
RETURNS public.stage_templates
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
declare v_key text; v_row public.stage_templates;
begin
  if not private.has_role(auth.uid(), 'admin') then
    raise exception 'غير مصرح';
  end if;
  if coalesce(btrim(p_label), '') = '' then
    raise exception 'اسم المرحلة مطلوب';
  end if;

  v_key := 'custom_' || substr(md5(gen_random_uuid()::text), 1, 10);

  insert into public.stage_templates (stage, label, position, requires_review, expected_days, is_active)
  values (
    v_key,
    btrim(p_label),
    coalesce((select max(position) from public.stage_templates), 0) + 1,
    coalesce(p_requires_review, false),
    greatest(coalesce(p_expected_days, 2), 0),
    true
  )
  returning * into v_row;

  perform private.sync_order_stages();
  return v_row;
end $$;

REVOKE ALL ON FUNCTION public.reorder_stage_templates(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_stage_template(text, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_stage_templates(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_stage_template(text, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION private.sync_order_stages() TO authenticated;