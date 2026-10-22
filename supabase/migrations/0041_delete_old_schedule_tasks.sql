-- Schedule tasks are deleted once their day is more than 30 days past, every
-- night. Their checklists go with them (task_subtasks cascades). A task still
-- pending is carried forward onto today every day (0035), so its day is never
-- that far back; what goes is what was done, plus leftovers too old to carry.
-- A task on the Tasks page that was also put on the schedule stays there: only
-- its schedule twin goes (personal_task_id is the twin's link, not the task's).
create or replace function public.delete_old_schedule_tasks()
returns void language sql security definer set search_path = public as $$
  delete from public.schedule_tasks
   where scheduled_date < (now() at time zone 'Asia/Jerusalem')::date - 30;
$$;

-- Cron-only: not callable through the REST API.
revoke execute on function public.delete_old_schedule_tasks() from public, anon, authenticated;

-- Nightly at 00:17 UTC (02:17 or 03:17 in Israel).
select cron.schedule('nestly_delete_old_schedule_tasks', '17 0 * * *', $$select public.delete_old_schedule_tasks();$$);
