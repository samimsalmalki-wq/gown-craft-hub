-- Security hardening after leaving Lovable Cloud.
--  1. Deactivated staff (profiles.is_active = false) lose every permission.
--  2. Non-admins can no longer change their own role, branch, department,
--     allowed stages or active flag through the profiles table.
--  3. New auth users get no role automatically (except the very first user,
--     who becomes admin). Staff accounts are created by an admin from the app.
--  4. Storage policies are restored to the original, stricter rules.

-- ===== 1. Active-user check wired into every permission helper =====

CREATE OR REPLACE FUNCTION private.is_active_user(_uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select is_active from public.profiles where id = _uid), false)
$$;

REVOKE ALL ON FUNCTION private.is_active_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_active_user(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select private.is_active_user(_user_id)
     and exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

CREATE OR REPLACE FUNCTION private.is_manager(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select private.is_active_user(_user_id)
     and exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','supervisor'))
$$;

CREATE OR REPLACE FUNCTION private.is_manager_or_supervisor(_uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select private.is_active_user(_uid)
     and exists (select 1 from public.user_roles where user_id = _uid and role in ('admin','supervisor'))
$$;

CREATE OR REPLACE FUNCTION private.is_staff(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select private.is_active_user(_user_id)
     and exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','supervisor','staff'))
$$;

CREATE OR REPLACE FUNCTION private.is_team(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select private.is_active_user(_user_id)
     and exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','supervisor','staff','cs'))
$$;

CREATE OR REPLACE FUNCTION private.has_permission(_user_id uuid, _permission text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select private.is_active_user(_user_id) and (
    exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','supervisor'))
    or exists (select 1 from public.user_permissions where user_id = _user_id and permission = _permission)
  )
$$;

CREATE OR REPLACE FUNCTION private.can(_user_id uuid, _permission text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select private.is_active_user(_user_id) and (
    exists (
      select 1 from public.user_roles where user_id = _user_id and role = 'admin'
    ) or exists (
      select 1 from public.user_permissions where user_id = _user_id and permission = _permission
    ) or exists (
      select 1
        from public.profiles p
        join public.role_permissions rp on rp.role_id = p.role_id
       where p.id = _user_id and rp.permission = _permission
    )
  )
$$;

-- ===== 2. Only admins may change access-related profile columns =====

CREATE OR REPLACE FUNCTION private.guard_profile_columns() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  -- Server-side calls (signup trigger, service role) have no auth.uid().
  if auth.uid() is null or private.has_role(auth.uid(), 'admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role_id := null;
    new.branch_id := null;
    new.department_id := null;
    new.allowed_stages := '{}';
    new.is_active := true;
  else
    new.id := old.id;
    new.role_id := old.role_id;
    new.branch_id := old.branch_id;
    new.department_id := old.department_id;
    new.allowed_stages := old.allowed_stages;
    new.is_active := old.is_active;
  end if;
  return new;
end; $$;

REVOKE ALL ON FUNCTION private.guard_profile_columns() FROM PUBLIC;

DROP TRIGGER IF EXISTS profiles_guard_columns ON public.profiles;
CREATE TRIGGER profiles_guard_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.guard_profile_columns();

-- ===== 3. No automatic role for new users (first user still becomes admin) =====

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;

  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role)
    values (new.id, 'admin'::public.app_role)
    on conflict do nothing;
  end if;
  return new;
end; $$;

-- ===== 4. Restore the original storage policies =====

DROP POLICY IF EXISTS "atelier files read by team"    ON storage.objects;
DROP POLICY IF EXISTS "atelier files insert by staff" ON storage.objects;
DROP POLICY IF EXISTS "atelier files update by staff" ON storage.objects;
DROP POLICY IF EXISTS "atelier files delete by staff" ON storage.objects;

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

DROP POLICY IF EXISTS "inventory images readable by team" ON storage.objects;
CREATE POLICY "inventory images readable by team" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'inventory' AND private.is_team(auth.uid()));

DROP POLICY IF EXISTS "inventory images insert by managers" ON storage.objects;
CREATE POLICY "inventory images insert by managers" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'inventory' AND private.is_manager_or_supervisor(auth.uid()) AND owner = auth.uid());

DROP POLICY IF EXISTS "inventory images update by managers" ON storage.objects;
CREATE POLICY "inventory images update by managers" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'inventory' AND private.is_manager_or_supervisor(auth.uid()))
  WITH CHECK (bucket_id = 'inventory' AND private.is_manager_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS "inventory images delete by managers" ON storage.objects;
CREATE POLICY "inventory images delete by managers" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'inventory' AND private.is_manager_or_supervisor(auth.uid()));
