-- Recurring tasks go on the schedule two weeks ahead instead of on the day
-- itself, so a household sees them coming. Recurring shopping items still land
-- on the list on their day (buying them two weeks early makes no sense).
--
-- last_generated_on now holds the latest occurrence placed, which can be in the
-- future; each run walks forward from it, so nothing is placed twice.

/**
 * Places the occurrences of recurring tasks that fall from from_date to to_date,
 * a day at a time in order (so every-2/4-weeks keeps its rhythm). only limits it
 * to one recurring task (a new one, from the insert trigger).
 * While an occurrence is still pending on a day already come (carried over,
 * 0035), the next one within the week is not created: the pending one stands
 * for it. Occurrences placed ahead don't count; they haven't come yet.
 */
create or replace function public.generate_recurring_tasks(from_date date, to_date date, only uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare d date; r record;
begin
  d := from_date;
  while d <= to_date loop
    for r in select * from public.recurring_tasks
      where active and day_of_week = extract(dow from d)::int
        and (only is null or id = only)
        and (last_generated_on is null or (d - last_generated_on) >= interval_weeks * 7) loop
      if not exists (
        select 1 from public.schedule_tasks p
         where p.recurring_id = r.id and not p.is_done
           and p.scheduled_date between d - 7 and least(d, from_date)
      ) then
        insert into public.schedule_tasks (home_id, title, description, category, scheduled_date, start_time, end_time, assigned_to, color, recurring_id, created_by)
        values (r.home_id, r.title, r.description, r.category, d, r.start_time, r.end_time, r.assigned_to, r.color, r.id, r.created_by);
      end if;
      update public.recurring_tasks set last_generated_on = d where id = r.id;
    end loop;
    d := d + 1;
  end loop;
end;
$$;

-- The daily run: shopping items for the day, tasks up to two weeks ahead.
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

  perform public.generate_recurring_tasks(target, target + 14);
end;
$$;

-- A new recurring task shows its next two weeks at once.
create or replace function public.on_recurring_task_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Jerusalem')::date;
begin
  perform public.generate_recurring_tasks(today, today + 14, new.id);
  return new;
end;
$$;

-- Deleting a recurring task takes its occurrences still ahead with it (they used
-- to be one at most; now up to two weeks of them). Today's and earlier ones stay.
create or replace function public.on_recurring_task_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.schedule_tasks
   where recurring_id = old.id and not is_done
     and scheduled_date > (now() at time zone 'Asia/Jerusalem')::date;
  return old;
end;
$$;

drop trigger if exists trg_recurring_task_delete on public.recurring_tasks;
create trigger trg_recurring_task_delete
  before delete on public.recurring_tasks
  for each row execute function public.on_recurring_task_delete();

-- Internal: the daily cron and the triggers call these, not the app.
revoke execute on function public.generate_recurring_tasks(date, date, uuid) from public, anon, authenticated;
revoke execute on function public.on_recurring_task_delete() from public, anon, authenticated;

-- Fill the next two weeks now rather than waiting for tonight's run.
select public.generate_recurring_tasks((now() at time zone 'Asia/Jerusalem')::date, (now() at time zone 'Asia/Jerusalem')::date + 14);
