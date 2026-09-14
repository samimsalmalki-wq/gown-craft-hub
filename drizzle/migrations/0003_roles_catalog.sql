-- كتالوج أدوار قابل للتوسيع من المدير
CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  is_builtin boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.roles TO authenticated;
GRANT INSERT, UPDATE ON public.roles TO authenticated;
GRANT ALL ON public.roles TO service_role;

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team can read roles" ON public.roles
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "admin can add roles" ON public.roles
  FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin can update roles" ON public.roles
  FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

CREATE TRIGGER roles_touch BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, permission)
);

GRANT SELECT, INSERT, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team can read role permissions" ON public.role_permissions
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "admin can add role permissions" ON public.role_permissions
  FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin can remove role permissions" ON public.role_permissions
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'));

-- الأدوار الأساسية الحالية
INSERT INTO public.roles (key, label, position, is_builtin) VALUES
  ('admin', 'مدير النظام', 1, true),
  ('supervisor', 'مشرف', 2, true),
  ('staff', 'موظف', 3, true),
  ('cs', 'خدمة عملاء', 4, true);

-- صلاحيات افتراضية للأدوار الأساسية
INSERT INTO public.role_permissions (role_id, permission)
SELECT r.id, p.perm
FROM public.roles r
JOIN (VALUES
  ('admin','orders.edit'),('admin','stages.edit'),('admin','finance.view'),('admin','files.upload'),
  ('admin','inventory.manage'),('admin','rentals.manage'),('admin','whatsapp.manage'),
  ('admin','reports.view'),('admin','staff.manage'),
  ('supervisor','orders.edit'),('supervisor','stages.edit'),('supervisor','finance.view'),
  ('supervisor','files.upload'),('supervisor','inventory.manage'),('supervisor','rentals.manage'),
  ('supervisor','whatsapp.manage'),('supervisor','reports.view'),
  ('staff','stages.edit'),('staff','files.upload'),
  ('cs','orders.edit'),('cs','finance.view'),('cs','rentals.manage')
) AS p(role_key, perm) ON p.role_key = r.key;

-- ربط الموظف بدوره في الكتالوج
ALTER TABLE public.profiles ADD COLUMN role_id uuid REFERENCES public.roles(id);

UPDATE public.profiles p
   SET role_id = r.id
  FROM public.user_roles ur
  JOIN public.roles r ON r.key = ur.role::text
 WHERE ur.user_id = p.id AND p.role_id IS NULL;

UPDATE public.profiles p
   SET role_id = (SELECT id FROM public.roles WHERE key = 'staff')
 WHERE p.role_id IS NULL;