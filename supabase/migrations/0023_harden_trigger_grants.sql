-- Trigger-only functions must not be callable via the REST API.
revoke execute on function public.on_recurring_task_insert() from public, anon, authenticated;
revoke execute on function public.on_schedule_task_insert() from public, anon, authenticated;
