CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

CREATE OR REPLACE FUNCTION private.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','staff'))
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_staff(uuid) TO authenticated, service_role;

-- profiles
DROP POLICY IF EXISTS "profiles readable by authenticated" ON public.profiles;
CREATE POLICY "profiles readable by staff or self" ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "own profile or admin update" ON public.profiles;
CREATE POLICY "own profile or admin update" ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid() OR private.has_role(auth.uid(), 'admin'));

-- user_roles / user_permissions
DROP POLICY IF EXISTS "admins manage roles" ON public.user_roles;
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "admins manage permissions" ON public.user_permissions;
CREATE POLICY "admins manage permissions" ON public.user_permissions FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));

-- orders
DROP POLICY IF EXISTS "orders readable" ON public.orders;
CREATE POLICY "orders readable by staff" ON public.orders FOR SELECT TO authenticated
USING (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "orders update" ON public.orders;
CREATE POLICY "orders update by staff" ON public.orders FOR UPDATE TO authenticated
USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "orders insert" ON public.orders;
CREATE POLICY "orders insert by staff" ON public.orders FOR INSERT TO authenticated
WITH CHECK (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "orders delete admin" ON public.orders;
CREATE POLICY "orders delete admin" ON public.orders FOR DELETE TO authenticated
USING (private.has_role(auth.uid(), 'admin'));

-- order_stages
DROP POLICY IF EXISTS "stages readable" ON public.order_stages;
CREATE POLICY "stages readable by staff" ON public.order_stages FOR SELECT TO authenticated
USING (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "stages update" ON public.order_stages;
CREATE POLICY "stages update by staff" ON public.order_stages FOR UPDATE TO authenticated
USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "stages insert" ON public.order_stages;
CREATE POLICY "stages insert by staff" ON public.order_stages FOR INSERT TO authenticated
WITH CHECK (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "stages delete admin" ON public.order_stages;
CREATE POLICY "stages delete admin" ON public.order_stages FOR DELETE TO authenticated
USING (private.has_role(auth.uid(), 'admin'));

-- order_files
DROP POLICY IF EXISTS "files readable" ON public.order_files;
CREATE POLICY "files readable by staff" ON public.order_files FOR SELECT TO authenticated
USING (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "files insert" ON public.order_files;
CREATE POLICY "files insert by staff" ON public.order_files FOR INSERT TO authenticated
WITH CHECK (
  private.is_staff(auth.uid())
  AND created_by = auth.uid()
  AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id)
  AND storage_path LIKE order_id::text || '/%'
);
DROP POLICY IF EXISTS "files delete" ON public.order_files;
CREATE POLICY "files delete" ON public.order_files FOR DELETE TO authenticated
USING (private.is_staff(auth.uid()) AND (created_by = auth.uid() OR private.has_role(auth.uid(), 'admin')));

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

-- storage objects for order-files bucket
DROP POLICY IF EXISTS "order files read" ON storage.objects;
CREATE POLICY "order files read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'order-files' AND private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "order files upload" ON storage.objects;
CREATE POLICY "order files upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'order-files'
  AND owner = auth.uid()
  AND private.is_staff(auth.uid())
  AND EXISTS (SELECT 1 FROM public.orders o WHERE name LIKE o.id::text || '/%')
);

DROP POLICY IF EXISTS "order files update" ON storage.objects;
CREATE POLICY "order files update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'order-files' AND private.is_staff(auth.uid()) AND (owner = auth.uid() OR private.has_role(auth.uid(), 'admin')))
WITH CHECK (bucket_id = 'order-files' AND private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "order files delete" ON storage.objects;
CREATE POLICY "order files delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'order-files' AND private.is_staff(auth.uid()) AND (owner = auth.uid() OR private.has_role(auth.uid(), 'admin')));