-- When a recurring task is created, immediately materialize its next occurrence
-- (today or the upcoming matching weekday), so it shows up in the schedule right
-- away instead of waiting for the daily cron. The cron then handles future weeks;
-- last_generated_on prevents a duplicate on the seeded date.
create or replace function public.on_recurring_task_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare today date; next_date date;
begin
  today := (now() at time zone 'Asia/Jerusalem')::date;
  next_date := today + ((new.day_of_week - extract(dow from today)::int + 7) % 7);

  insert into public.schedule_tasks
    (home_id, title, description, category, scheduled_date, start_time, end_time,
     assigned_to, color, recurring_id, created_by)
  values
    (new.home_id, new.title, new.description, new.category, next_date, new.start_time,
     new.end_time, new.assigned_to, new.color, new.id, new.created_by);

  update public.recurring_tasks set last_generated_on = next_date where id = new.id;
  return new;
end;
$$;

drop trigger if exists trg_recurring_task_insert on public.recurring_tasks;
create trigger trg_recurring_task_insert
  after insert on public.recurring_tasks
  for each row execute function public.on_recurring_task_insert();
