-- Notify the household when a task is added to the schedule.
-- Recipients: everyone except the creator, plus the assignee (so a creator who
-- assigns a task to themselves is notified too). Auto-generated recurring
-- occurrences (recurring_id set) are skipped so daily generation doesn't spam.
-- The every-minute dispatch_push cron then pushes these within ~1 minute.
create or replace function public.on_schedule_task_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare when_txt text; who text;
begin
  if new.recurring_id is not null then
    return new;
  end if;

  when_txt := to_char(new.scheduled_date, 'DD/MM');
  if new.start_time is not null then
    when_txt := when_txt || ' · ' || to_char(new.start_time, 'HH24:MI');
  end if;

  if new.assigned_to is not null then
    who := coalesce((select display_name from public.profiles p where p.id = new.assigned_to), '');
  end if;

  insert into public.notifications (home_id, user_id, type, title, body, link, related_table, related_id)
  select new.home_id, m.user_id, 'task_added', 'משימה חדשה בלוז',
         new.title || ' · ' || when_txt || case when who is not null and who <> '' then ' (' || who || ')' else '' end,
         '/#/schedule', 'schedule_tasks', new.id
  from public.home_members m
  where m.home_id = new.home_id
    and (m.user_id is distinct from new.created_by or m.user_id = new.assigned_to);

  return new;
end;
$$;

drop trigger if exists trg_schedule_task_insert on public.schedule_tasks;
create trigger trg_schedule_task_insert
  after insert on public.schedule_tasks
  for each row execute function public.on_schedule_task_insert();
