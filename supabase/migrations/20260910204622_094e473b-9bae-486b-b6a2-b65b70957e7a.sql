-- ===== helper roles =====
CREATE OR REPLACE FUNCTION private.is_team(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','supervisor','staff','cs'))
$$;

CREATE OR REPLACE FUNCTION private.is_manager(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','supervisor'))
$$;

CREATE OR REPLACE FUNCTION private.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','supervisor','staff'))
$$;

CREATE OR REPLACE FUNCTION private.has_permission(_user_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','supervisor'))
      or exists (select 1 from public.user_permissions where user_id = _user_id and permission = _permission)
$$;

REVOKE ALL ON FUNCTION private.is_team(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_manager(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_team(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_manager(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_permission(uuid, text) TO authenticated, service_role;

-- ===== departments =====
CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "departments readable by team" ON public.departments;
CREATE POLICY "departments readable by team" ON public.departments FOR SELECT TO authenticated
USING (private.is_team(auth.uid()));
GRANT INSERT, UPDATE, DELETE ON public.departments TO authenticated;
DROP POLICY IF EXISTS "departments managed by admin" ON public.departments;
CREATE POLICY "departments managed by admin" ON public.departments FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));

INSERT INTO public.departments (name, position) VALUES
  ('الإدارة', 1), ('خدمة العملاء', 2), ('القياسات', 3), ('التصميم', 4),
  ('القص', 5), ('الخياطة', 6), ('التطريز', 7), ('التشطيب', 8),
  ('التعديلات', 9), ('الجودة', 10), ('التسليم', 11)
ON CONFLICT (name) DO NOTHING;

-- ===== profiles extras =====
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS allowed_stages public.stage_key[] NOT NULL DEFAULT '{}';

DROP POLICY IF EXISTS "profiles readable by staff or self" ON public.profiles;
CREATE POLICY "profiles readable by team or self" ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR private.is_team(auth.uid()));

-- ===== stage templates =====
CREATE TABLE IF NOT EXISTS public.stage_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage public.stage_key NOT NULL UNIQUE,
  label text NOT NULL,
  position int NOT NULL,
  requires_review boolean NOT NULL DEFAULT false,
  expected_days int NOT NULL DEFAULT 2,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stage_templates TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.stage_templates TO authenticated;
GRANT ALL ON public.stage_templates TO service_role;
ALTER TABLE public.stage_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "templates readable by team" ON public.stage_templates;
CREATE POLICY "templates readable by team" ON public.stage_templates FOR SELECT TO authenticated
USING (private.is_team(auth.uid()));
DROP POLICY IF EXISTS "templates managed by admin" ON public.stage_templates;
CREATE POLICY "templates managed by admin" ON public.stage_templates FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS templates_touch ON public.stage_templates;
CREATE TRIGGER templates_touch BEFORE UPDATE ON public.stage_templates
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.stage_templates (stage, label, position, requires_review, expected_days) VALUES
  ('booking','الحجز',1,false,1),
  ('measurements','أخذ المقاسات',2,false,1),
  ('design','التصميم',3,true,3),
  ('design_approval','اعتماد التصميم',4,true,1),
  ('materials','تجهيز الخامات',5,false,2),
  ('cutting','القص',6,true,1),
  ('sewing','الخياطة',7,true,5),
  ('embroidery','التطريز',8,true,4),
  ('finishing','التشطيب',9,false,2),
  ('fitting1','البروفة الأولى',10,false,1),
  ('alterations','التعديلات',11,true,3),
  ('fitting2','البروفة الثانية',12,false,1),
  ('final_alterations','التعديلات النهائية',13,true,2),
  ('quality','الجودة',14,true,1),
  ('prep_delivery','التجهيز للتسليم',15,false,1),
  ('delivery','التسليم',16,false,1)
ON CONFLICT (stage) DO NOTHING;

-- ===== order_stages extras =====
ALTER TABLE public.order_stages
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS due_at date,
  ADD COLUMN IF NOT EXISTS priority public.task_priority NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS duration_minutes int,
  ADD COLUMN IF NOT EXISTS delay_reason text,
  ADD COLUMN IF NOT EXISTS review_status text,
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rework_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS requires_review boolean NOT NULL DEFAULT false;

-- backfill new stages for existing orders + sync positions/labels
INSERT INTO public.order_stages (order_id, stage, position, status, requires_review)
SELECT o.id, t.stage, t.position, 'pending'::public.stage_status, t.requires_review
FROM public.orders o
CROSS JOIN public.stage_templates t
WHERE NOT EXISTS (
  SELECT 1 FROM public.order_stages s WHERE s.order_id = o.id AND s.stage = t.stage
);

UPDATE public.order_stages s
SET position = t.position, requires_review = t.requires_review
FROM public.stage_templates t
WHERE s.stage = t.stage AND (s.position <> t.position OR s.requires_review <> t.requires_review);

-- default stage creation from templates
CREATE OR REPLACE FUNCTION public.create_default_stages()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
begin
  insert into public.order_stages (order_id, stage, position, status, requires_review)
  select new.id, t.stage, t.position,
         case when t.position = (select min(position) from public.stage_templates where is_active)
              then 'in_progress'::public.stage_status else 'pending'::public.stage_status end,
         t.requires_review
  from public.stage_templates t
  where t.is_active
  order by t.position;
  return new;
end $$;

-- duration bookkeeping
CREATE OR REPLACE FUNCTION public.stage_duration()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
begin
  if new.started_at is not null and new.completed_at is not null then
    new.duration_minutes := greatest(0, (extract(epoch from (new.completed_at - new.started_at)) / 60)::int);
  end if;
  return new;
end $$;
DROP TRIGGER IF EXISTS stages_duration ON public.order_stages;
CREATE TRIGGER stages_duration BEFORE INSERT OR UPDATE ON public.order_stages
FOR EACH ROW EXECUTE FUNCTION public.stage_duration();

-- ===== alterations =====
CREATE TABLE IF NOT EXISTS public.alterations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.order_stages(id) ON DELETE SET NULL,
  number int NOT NULL,
  description text NOT NULL,
  notes text,
  assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status public.alteration_status NOT NULL DEFAULT 'requested',
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, number)
);
GRANT SELECT, INSERT, UPDATE ON public.alterations TO authenticated;
GRANT ALL ON public.alterations TO service_role;
ALTER TABLE public.alterations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "alterations readable by team" ON public.alterations;
CREATE POLICY "alterations readable by team" ON public.alterations FOR SELECT TO authenticated
USING (private.is_team(auth.uid()));
DROP POLICY IF EXISTS "alterations insert" ON public.alterations;
CREATE POLICY "alterations insert" ON public.alterations FOR INSERT TO authenticated
WITH CHECK (private.has_permission(auth.uid(), 'stages.edit') AND created_by = auth.uid());
DROP POLICY IF EXISTS "alterations update" ON public.alterations;
CREATE POLICY "alterations update" ON public.alterations FOR UPDATE TO authenticated
USING (private.has_permission(auth.uid(), 'stages.edit'))
WITH CHECK (private.has_permission(auth.uid(), 'stages.edit'));
DROP TRIGGER IF EXISTS alterations_touch ON public.alterations;
CREATE TRIGGER alterations_touch BEFORE UPDATE ON public.alterations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.set_alteration_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
begin
  if new.number is null or new.number = 0 then
    select coalesce(max(number), 0) + 1 into new.number from public.alterations where order_id = new.order_id;
  end if;
  return new;
end $$;
DROP TRIGGER IF EXISTS alterations_number ON public.alterations;
CREATE TRIGGER alterations_number BEFORE INSERT ON public.alterations
FOR EACH ROW EXECUTE FUNCTION public.set_alteration_number();

-- ===== activity log =====
CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.order_stages(id) ON DELETE SET NULL,
  actor_id uuid,
  action text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "log readable by team" ON public.activity_log;
CREATE POLICY "log readable by team" ON public.activity_log FOR SELECT TO authenticated
USING (private.is_team(auth.uid()));

CREATE OR REPLACE FUNCTION public.log_activity(_order_id uuid, _stage_id uuid, _action text, _details text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  insert into public.activity_log (order_id, stage_id, actor_id, action, details)
  values (_order_id, _stage_id, auth.uid(), _action, _details);
end $$;
REVOKE ALL ON FUNCTION public.log_activity(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_activity(uuid, uuid, text, text) TO authenticated, service_role;

-- ===== notifications =====
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.order_stages(id) ON DELETE SET NULL,
  kind text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own notifications" ON public.notifications;
CREATE POLICY "own notifications" ON public.notifications FOR SELECT TO authenticated
USING (user_id = auth.uid());
DROP POLICY IF EXISTS "own notifications update" ON public.notifications;
CREATE POLICY "own notifications update" ON public.notifications FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION private.notify(_user_id uuid, _order_id uuid, _stage_id uuid, _kind text, _message text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if _user_id is null then return; end if;
  insert into public.notifications (user_id, order_id, stage_id, kind, message)
  values (_user_id, _order_id, _stage_id, _kind, _message);
end $$;

-- ===== automatic logging + notifications =====
CREATE OR REPLACE FUNCTION public.audit_orders()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if TG_OP = 'INSERT' then
    perform public.log_activity(new.id, null, 'order_created', 'إنشاء الطلب ' || new.order_no);
    return new;
  end if;
  if new.current_stage is distinct from old.current_stage then
    perform public.log_activity(new.id, null, 'stage_changed', 'انتقال إلى مرحلة: ' || new.current_stage::text);
  end if;
  if new.due_date is distinct from old.due_date then
    perform public.log_activity(new.id, null, 'due_date_changed', 'موعد التسليم: ' || coalesce(new.due_date::text,'—'));
  end if;
  if new.payment_status is distinct from old.payment_status then
    perform public.log_activity(new.id, null, 'payment_changed', 'حالة الدفع: ' || new.payment_status::text);
  end if;
  if new.state is distinct from old.state then
    perform public.log_activity(new.id, null, 'state_changed', 'حالة الطلب: ' || new.state::text);
  end if;
  return new;
end $$;
DROP TRIGGER IF EXISTS orders_audit_ins ON public.orders;
CREATE TRIGGER orders_audit_ins AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.audit_orders();
DROP TRIGGER IF EXISTS orders_audit_upd ON public.orders;
CREATE TRIGGER orders_audit_upd AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.audit_orders();

CREATE OR REPLACE FUNCTION public.audit_stages()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare v_no text; v_label text; m record;
begin
  select order_no into v_no from public.orders where id = new.order_id;
  select label into v_label from public.stage_templates where stage = new.stage;
  v_label := coalesce(v_label, new.stage::text);

  if new.assignee_id is distinct from old.assignee_id then
    perform public.log_activity(new.order_id, new.id, 'assigned',
      'إسناد مرحلة ' || v_label || ' إلى ' || coalesce(new.assignee_name, '—'));
    perform private.notify(new.assignee_id, new.order_id, new.id, 'task_assigned',
      'لديك مهمة جديدة: ' || v_label || ' — طلب ' || coalesce(v_no,''));
  end if;

  if new.status is distinct from old.status then
    perform public.log_activity(new.order_id, new.id, 'stage_status',
      v_label || ' → ' || new.status::text);
    if new.status = 'in_progress' and old.status <> 'in_progress' then
      perform public.log_activity(new.order_id, new.id, 'work_started', 'بدء العمل في ' || v_label);
    elsif new.status = 'blocked' then
      perform public.log_activity(new.order_id, new.id, 'work_paused',
        'إيقاف العمل في ' || v_label || coalesce(' — ' || new.delay_reason, ''));
    elsif new.status = 'review' then
      perform public.log_activity(new.order_id, new.id, 'work_finished', 'إنهاء العمل بانتظار المراجعة: ' || v_label);
      for m in select ur.user_id from public.user_roles ur where ur.role in ('admin','supervisor') loop
        perform private.notify(m.user_id, new.order_id, new.id, 'review_needed',
          'مرحلة ' || v_label || ' في طلب ' || coalesce(v_no,'') || ' تحتاج مراجعة');
      end loop;
    elsif new.status = 'done' then
      perform public.log_activity(new.order_id, new.id, 'work_finished', 'إكمال مرحلة ' || v_label);
    end if;
  end if;

  if new.review_status is distinct from old.review_status and new.review_status is not null then
    perform public.log_activity(new.order_id, new.id,
      case new.review_status when 'approved' then 'stage_approved' else 'stage_rejected' end,
      v_label || coalesce(' — ' || new.review_notes, ''));
    perform private.notify(new.assignee_id, new.order_id, new.id,
      case new.review_status when 'approved' then 'approved' else 'rejected' end,
      case new.review_status
        when 'approved' then 'تم اعتماد العمل في ' || v_label
        else 'تم رفض مرحلة ' || v_label || ' وتحتاج تعديلًا' || coalesce(': ' || new.review_notes, '')
      end);
  end if;
  return new;
end $$;
DROP TRIGGER IF EXISTS stages_audit ON public.order_stages;
CREATE TRIGGER stages_audit AFTER UPDATE ON public.order_stages
FOR EACH ROW EXECUTE FUNCTION public.audit_stages();

CREATE OR REPLACE FUNCTION public.audit_alterations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if TG_OP = 'INSERT' then
    perform public.log_activity(new.order_id, new.stage_id, 'alteration_added',
      'تعديل رقم ' || new.number || ': ' || new.description);
    perform private.notify(new.assignee_id, new.order_id, new.stage_id, 'task_assigned',
      'تعديل جديد مسند إليك: ' || new.description);
  elsif new.status is distinct from old.status then
    perform public.log_activity(new.order_id, new.stage_id, 'alteration_status',
      'تعديل رقم ' || new.number || ' → ' || new.status::text);
  end if;
  return new;
end $$;
DROP TRIGGER IF EXISTS alterations_audit_ins ON public.alterations;
CREATE TRIGGER alterations_audit_ins AFTER INSERT ON public.alterations
FOR EACH ROW EXECUTE FUNCTION public.audit_alterations();
DROP TRIGGER IF EXISTS alterations_audit_upd ON public.alterations;
CREATE TRIGGER alterations_audit_upd AFTER UPDATE ON public.alterations
FOR EACH ROW EXECUTE FUNCTION public.audit_alterations();

CREATE OR REPLACE FUNCTION public.audit_files()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  perform public.log_activity(new.order_id, new.stage_id, 'file_added', 'إضافة مرفق');
  return new;
end $$;
DROP TRIGGER IF EXISTS files_audit ON public.order_files;
CREATE TRIGGER files_audit AFTER INSERT ON public.order_files
FOR EACH ROW EXECUTE FUNCTION public.audit_files();

-- ===== refreshed access rules for existing tables =====
DROP POLICY IF EXISTS "orders readable by staff" ON public.orders;
CREATE POLICY "orders readable by team" ON public.orders FOR SELECT TO authenticated
USING (private.is_team(auth.uid()));
DROP POLICY IF EXISTS "orders update by staff" ON public.orders;
CREATE POLICY "orders update by editors" ON public.orders FOR UPDATE TO authenticated
USING (private.has_permission(auth.uid(), 'orders.edit'))
WITH CHECK (private.has_permission(auth.uid(), 'orders.edit'));
DROP POLICY IF EXISTS "orders insert by staff" ON public.orders;
CREATE POLICY "orders insert by editors" ON public.orders FOR INSERT TO authenticated
WITH CHECK (private.has_permission(auth.uid(), 'orders.edit'));

DROP POLICY IF EXISTS "stages readable by staff" ON public.order_stages;
CREATE POLICY "stages readable by team" ON public.order_stages FOR SELECT TO authenticated
USING (private.is_team(auth.uid()));
DROP POLICY IF EXISTS "stages update by staff" ON public.order_stages;
CREATE POLICY "stages update by editors" ON public.order_stages FOR UPDATE TO authenticated
USING (
  private.is_manager(auth.uid())
  OR (private.has_permission(auth.uid(), 'stages.edit') AND assignee_id = auth.uid())
)
WITH CHECK (
  private.is_manager(auth.uid())
  OR (private.has_permission(auth.uid(), 'stages.edit') AND assignee_id = auth.uid())
);
DROP POLICY IF EXISTS "stages delete admin" ON public.order_stages;

DROP POLICY IF EXISTS "files readable by staff" ON public.order_files;
CREATE POLICY "files readable by team" ON public.order_files FOR SELECT TO authenticated
USING (private.is_team(auth.uid()));