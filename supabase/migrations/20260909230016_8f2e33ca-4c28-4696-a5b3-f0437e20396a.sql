revoke all on function public.handle_new_user() from public;
revoke all on function public.create_default_stages() from public;
revoke all on function public.touch_updated_at() from public;
revoke all on function public.has_role(uuid, public.app_role) from public;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
