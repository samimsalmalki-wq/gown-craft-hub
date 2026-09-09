revoke all on function public.handle_new_user() from anon, authenticated;
revoke all on function public.create_default_stages() from anon, authenticated;
revoke all on function public.touch_updated_at() from anon, authenticated;
revoke all on function public.has_role(uuid, public.app_role) from anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
