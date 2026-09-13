CREATE POLICY "team can log whatsapp sends"
  ON public.activity_log FOR INSERT
  TO authenticated
  WITH CHECK (
    private.is_team(auth.uid())
    AND action = 'whatsapp_sent'
    AND actor_id = auth.uid()
  );

GRANT INSERT ON public.activity_log TO authenticated;
