-- 1) تحويل مفاتيح المراحل من enum إلى نص
ALTER TABLE public.stage_templates ALTER COLUMN stage TYPE text USING stage::text;
ALTER TABLE public.order_stages ALTER COLUMN stage TYPE text USING stage::text;
ALTER TABLE public.orders ALTER COLUMN current_stage DROP DEFAULT;
ALTER TABLE public.orders ALTER COLUMN current_stage TYPE text USING current_stage::text;
ALTER TABLE public.orders ALTER COLUMN current_stage SET DEFAULT 'booking';
ALTER TABLE public.profiles ALTER COLUMN allowed_stages DROP DEFAULT;
ALTER TABLE public.profiles ALTER COLUMN allowed_stages TYPE text[] USING allowed_stages::text[];
ALTER TABLE public.profiles ALTER COLUMN allowed_stages SET DEFAULT '{}'::text[];

CREATE UNIQUE INDEX IF NOT EXISTS stage_templates_stage_uidx ON public.stage_templates (stage);

-- 2) مزامنة مراحل الطلبات الجارية مع القالب
CREATE OR REPLACE FUNCTION private.sync_order_stages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  insert into public.order_stages (order_id, stage, position, status, requires_review)
  select o.id, t.stage, t.position, 'pending'::public.stage_status, t.requires_review
  from public.orders o
  cross join public.stage_templates t
  where o.state = 'active'
    and t.is_active
    and not exists (
      select 1 from public.order_stages s where s.order_id = o.id and s.stage = t.stage
    );

  update public.order_stages s
     set position = t.position
    from public.stage_templates t, public.orders o
   where t.stage = s.stage
     and o.id = s.order_id
     and o.state = 'active'
     and s.position <> t.position;
end $$;

REVOKE ALL ON FUNCTION private.sync_order_stages() FROM PUBLIC;

-- 3) إعادة ترتيب القالب (للمدير فقط)
CREATE OR REPLACE FUNCTION public.reorder_stage_templates(p_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  if not private.has_role(auth.uid(), 'admin') then
    raise exception 'غير مصرح';
  end if;

  update public.stage_templates t
     set position = i.ord
    from (
      select id, ord
      from unnest(p_ids) with ordinality as u(id, ord)
    ) i
   where t.id = i.id;

  perform private.sync_order_stages();
end $$;

REVOKE ALL ON FUNCTION public.reorder_stage_templates(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_stage_templates(uuid[]) TO authenticated;

-- 4) إضافة مرحلة جديدة (للمدير فقط)
CREATE OR REPLACE FUNCTION public.add_stage_template(
  p_label text,
  p_expected_days integer DEFAULT 2,
  p_requires_review boolean DEFAULT false
)
RETURNS public.stage_templates
LANGUAGE plpgsql
SECURITY DEFINER
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

REVOKE ALL ON FUNCTION public.add_stage_template(text, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_stage_template(text, integer, boolean) TO authenticated;