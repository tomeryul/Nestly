-- Remind whoever is responsible when cleaning tasks aren't done before the
-- week/month ends. Runs daily; the weekly part fires on Friday, the monthly
-- part 2 days before month-end. Recipients: a task's assignee, or (for
-- unassigned tasks) members with the 'cleaning' responsibility.
create or replace function public.cleaning_reminders()
returns void language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Jerusalem')::date;
  dow int := extract(dow from today)::int;
  week_start date := today - dow;
  week_key text := to_char(week_start, 'YYYY-MM-DD');
  month_key text := to_char(today, 'YYYY-MM');
  last_dom date := (date_trunc('month', today) + interval '1 month - 1 day')::date;
  rec record;
begin
  if dow = 5 then
    for rec in
      select m.home_id, m.user_id, count(*) as cnt
      from public.home_members m
      join public.cleaning_tasks c on c.home_id = m.home_id and c.frequency = 'weekly'
      where not exists (select 1 from public.cleaning_completions cc where cc.cleaning_task_id = c.id and cc.period_key = week_key)
        and (c.assigned_to = m.user_id or (c.assigned_to is null and 'cleaning' = any (m.responsibilities)))
      group by m.home_id, m.user_id
    loop
      if not exists (select 1 from public.notifications n where n.user_id = rec.user_id and n.type = 'cleaning_weekly' and n.created_at >= week_start) then
        insert into public.notifications (home_id, user_id, type, title, body, link)
        values (rec.home_id, rec.user_id, 'cleaning_weekly', 'תזכורת ניקיון שבועי 🧽',
                'נשארו ' || rec.cnt || ' משימות ניקיון להשלים לפני סוף השבוע', '/#/cleaning');
      end if;
    end loop;
  end if;

  if today = last_dom - 2 then
    for rec in
      select m.home_id, m.user_id, count(*) as cnt
      from public.home_members m
      join public.cleaning_tasks c on c.home_id = m.home_id and c.frequency = 'monthly'
      where not exists (select 1 from public.cleaning_completions cc where cc.cleaning_task_id = c.id and cc.period_key = month_key)
        and (c.assigned_to = m.user_id or (c.assigned_to is null and 'cleaning' = any (m.responsibilities)))
      group by m.home_id, m.user_id
    loop
      if not exists (select 1 from public.notifications n where n.user_id = rec.user_id and n.type = 'cleaning_monthly' and n.created_at >= date_trunc('month', today)) then
        insert into public.notifications (home_id, user_id, type, title, body, link)
        values (rec.home_id, rec.user_id, 'cleaning_monthly', 'תזכורת ניקיון חודשי 🧽',
                'נשארו ' || rec.cnt || ' משימות ניקיון חודשיות להשלים עד סוף החודש', '/#/cleaning');
      end if;
    end loop;
  end if;
end;
$$;

revoke execute on function public.cleaning_reminders() from public, anon, authenticated;

select cron.unschedule('nestly_cleaning_reminders') where exists (select 1 from cron.job where jobname = 'nestly_cleaning_reminders');
select cron.schedule('nestly_cleaning_reminders', '0 6 * * *', $$select public.cleaning_reminders();$$);
