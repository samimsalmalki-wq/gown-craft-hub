CREATE POLICY "inventory images readable by team" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'inventory' AND private.is_team(auth.uid()));

CREATE POLICY "inventory images insert by managers" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'inventory' AND private.is_manager_or_supervisor(auth.uid()) AND owner = auth.uid());

CREATE POLICY "inventory images update by managers" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'inventory' AND private.is_manager_or_supervisor(auth.uid()))
  WITH CHECK (bucket_id = 'inventory' AND private.is_manager_or_supervisor(auth.uid()));

CREATE POLICY "inventory images delete by managers" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'inventory' AND private.is_manager_or_supervisor(auth.uid()));