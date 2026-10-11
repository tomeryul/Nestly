-- Unfinished schedule tasks carry over to the next day, every day, until they
-- are ticked. A carried task remembers the day it was first meant for
-- (carried_from) so the app can say "from yesterday" next to it.

alter table public.schedule_tasks add column if not exists carried_from date;
comment on column public.schedule_tasks.carried_from is
  'The day a task was first scheduled for, once it has been carried forward unfinished; null otherwise.';

-- Moves every unfinished task from an earlier day onto today (Asia/Jerusalem).
-- Idempotent, so it can run hourly; the first run after midnight does the work.
--  * Only the last 7 days are swept: enough to recover from missed runs, and it
--    leaves leftovers that were already months old when this shipped where they
--    are instead of piling them all onto one day.
--  * A recurring chore whose next occurrence has already come round (done or
--    not) stays behind: the newer occurrence carries it, so it never shows twice.
--  * reminded resets, so a timed task reminds again at its time on the new day.
create or replace function public.carry_over_unfinished_tasks()
returns void language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Jerusalem')::date;
begin
  update public.schedule_tasks t
     set carried_from   = coalesce(t.carried_from, t.scheduled_date),
         scheduled_date = today,
         reminded       = false
   where not t.is_done
     and t.scheduled_date < today
     and t.scheduled_date >= today - 7
     and not (t.recurring_id is not null and exists (
       select 1 from public.schedule_tasks n
        where n.recurring_id = t.recurring_id
          and n.id <> t.id
          and n.scheduled_date > t.scheduled_date
          and n.scheduled_date <= today));
end;
$$;

-- Same generator as 0020, with one rule added for tasks: while an occurrence of
-- a recurring chore is still pending (carried over), the next one is not
-- created — the pending one already stands for it. The cycle still advances.
create or replace function public.generate_recurring(target date default current_date)
returns void language plpgsql security definer set search_path = public as $$
declare dow int := extract(dow from target)::int; r record; default_list uuid;
begin
  for r in select * from public.recurring_shopping_items
    where active and day_of_week = dow and (last_added_on is null or last_added_on < target) loop
    select coalesce(r.target_list_id,
      (select id from public.shopping_lists where home_id = r.home_id order by is_default desc, created_at asc limit 1))
      into default_list;
    if default_list is not null then
      insert into public.shopping_items (list_id, home_id, name, quantity, unit, category, source, created_by)
      values (default_list, r.home_id, r.name, r.quantity, r.unit, r.category, 'recurring', r.created_by);
    end if;
    update public.recurring_shopping_items set last_added_on = target where id = r.id;
  end loop;

  for r in select * from public.recurring_tasks
    where active and day_of_week = dow
      and (last_generated_on is null or (target - last_generated_on) >= interval_weeks * 7) loop
    if not exists (
      select 1 from public.schedule_tasks p
       where p.recurring_id = r.id and not p.is_done
         and p.scheduled_date between target - 7 and target
    ) then
      insert into public.schedule_tasks (home_id, title, description, category, scheduled_date, start_time, end_time, assigned_to, color, recurring_id, created_by)
      values (r.home_id, r.title, r.description, r.category, target, r.start_time, r.end_time, r.assigned_to, r.color, r.id, r.created_by);
    end if;
    update public.recurring_tasks set last_generated_on = target where id = r.id;
  end loop;
end;
$$;

-- Cron-only: not callable through the REST API.
revoke execute on function public.carry_over_unfinished_tasks() from public, anon, authenticated;

-- Hourly at :01 (UTC). Israel's midnight is 21:00 or 22:00 UTC depending on
-- daylight saving, so an hourly run lands a minute after it either way.
select cron.unschedule('nestly_carry_over_tasks') where exists (select 1 from cron.job where jobname = 'nestly_carry_over_tasks');
select cron.schedule('nestly_carry_over_tasks', '1 * * * *', $$select public.carry_over_unfinished_tasks();$$);
