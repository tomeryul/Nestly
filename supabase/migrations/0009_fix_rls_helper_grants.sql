-- Fix: 0008 over-revoked. is_home_member / is_home_owner are called *inside*
-- every table's RLS policy, and RLS expressions run as the querying role — so
-- that role must have EXECUTE. Without it, every authenticated read failed with
-- "permission denied for function is_home_member", which made freshly created
-- homes appear to vanish. Re-grant execute to the client roles.
grant execute on function public.is_home_member(uuid) to authenticated, anon;
grant execute on function public.is_home_owner(uuid) to authenticated, anon;
