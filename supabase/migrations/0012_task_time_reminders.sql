-- Fire a reminder WHEN a task's date+time arrives (interpreted in Asia/Jerusalem),
-- instead of the earlier UTC-based 30-min-ahead check that fired at the wrong
-- wall-clock time. The 30-minute lower bound lets a brief cron/outage still
-- deliver; `reminded` guarantees one notification per task. Recurring
-- occurrences carry reminded=false, so they get time reminders too.
create or replace function public.create_task_reminders()
returns void language plpgsql security definer set search_path = public as $$
declare t record;
begin
  for t in
    select * from public.schedule_tasks
    where not is_done and not reminded and start_time is not null
      and ((scheduled_date + start_time) at time zone 'Asia/Jerusalem')
          between now() - interval '30 minutes' and now() + interval '30 seconds'
  loop
    if t.assigned_to is not null then
      insert into public.notifications (home_id, user_id, type, title, body, link, related_table, related_id)
      values (t.home_id, t.assigned_to, 'task_reminder', '⏰ הגיע הזמן: ' || t.title,
              'המשימה מתחילה עכשיו · ' || to_char(t.start_time, 'HH24:MI'), '/#/schedule', 'schedule_tasks', t.id);
    else
      insert into public.notifications (home_id, user_id, type, title, body, link, related_table, related_id)
      select t.home_id, m.user_id, 'task_reminder', '⏰ הגיע הזמן: ' || t.title,
             'המשימה מתחילה עכשיו · ' || to_char(t.start_time, 'HH24:MI'), '/#/schedule', 'schedule_tasks', t.id
      from public.home_members m where m.home_id = t.home_id;
    end if;
    update public.schedule_tasks set reminded = true where id = t.id;
  end loop;
end;
$$;

-- Run every minute so reminders land within ~1 minute of the scheduled time.
select cron.unschedule('nestly_task_reminders') where exists (select 1 from cron.job where jobname = 'nestly_task_reminders');
select cron.schedule('nestly_task_reminders', '* * * * *', $$select public.create_task_reminders();$$);
