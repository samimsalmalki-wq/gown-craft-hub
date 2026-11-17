DROP POLICY IF EXISTS "permissions readable by authenticated" ON public.user_permissions;
CREATE POLICY "permissions readable by self or staff managers" ON public.user_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin') OR private.can(auth.uid(), 'staff.manage'));

DROP POLICY IF EXISTS "roles readable by authenticated" ON public.user_roles;
CREATE POLICY "roles readable by self or team" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_team(auth.uid()));

DROP POLICY IF EXISTS "staff can read whatsapp templates" ON public.whatsapp_templates;
CREATE POLICY "team can read whatsapp templates" ON public.whatsapp_templates
  FOR SELECT TO authenticated
  USING (private.is_team(auth.uid()));