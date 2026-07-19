-- Nestly automation layer: private config, recurring generation, reminders, pg_cron

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- private config (NOT exposed through the API — only edge functions read it
-- via the service role). Holds VAPID keys, the push function URL and the
-- cron shared secret.
-- ---------------------------------------------------------------------------
create schema if not exists private;

create table if not exists private.app_config (
  key   text primary key,
  value text not null
);
alter table private.app_config enable row level security;  -- no policies => no API access

-- Reminder-tracking column so we don't spam the same task twice
alter table public.schedule_tasks
  add column if not exists reminded boolean not null default false;

-- ---------------------------------------------------------------------------
-- Materialize recurring shopping items + recurring tasks for a target date.
-- Runs daily; idempotent via last_added_on / last_generated_on guards.
-- ---------------------------------------------------------------------------
create or replace function public.generate_recurring(target date default current_date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  dow int := extract(dow from target)::int;   -- 0=Sun .. 6=Sat
  r   record;
  default_list uuid;
begin
  -- recurring shopping items due today
  for r in
    select * from public.recurring_shopping_items
    where active and day_of_week = dow
      and (last_added_on is null or last_added_on < target)
  loop
    select coalesce(
      r.target_list_id,
      (select id from public.shopping_lists
        where home_id = r.home_id order by is_default desc, created_at asc limit 1)
    ) into default_list;

    if default_list is not null then
      insert into public.shopping_items
        (list_id, home_id, name, quantity, unit, category, source, created_by)
      values
        (default_list, r.home_id, r.name, r.quantity, r.unit, r.category, 'recurring', r.created_by);
    end if;

    update public.recurring_shopping_items set last_added_on = target where id = r.id;
  end loop;

  -- recurring schedule tasks due today
  for r in
    select * from public.recurring_tasks
    where active and day_of_week = dow
      and (last_generated_on is null or last_generated_on < target)
  loop
    insert into public.schedule_tasks
      (home_id, title, description, category, scheduled_date, start_time, end_time,
       assigned_to, color, recurring_id, created_by)
    values
      (r.home_id, r.title, r.description, r.category, target, r.start_time, r.end_time,
       r.assigned_to, r.color, r.id, r.created_by);

    update public.recurring_tasks set last_generated_on = target where id = r.id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Create reminder notifications for tasks starting soon (next ~30 min).
-- ---------------------------------------------------------------------------
create or replace function public.create_task_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  for t in
    select * from public.schedule_tasks
    where not is_done and not reminded
      and scheduled_date = current_date
      and start_time is not null
      and (current_date + start_time) between now() and now() + interval '30 minutes'
  loop
    if t.assigned_to is not null then
      insert into public.notifications (home_id, user_id, type, title, body, link, related_table, related_id)
      values (t.home_id, t.assigned_to, 'task_reminder', 'תזכורת: ' || t.title,
              'מתחיל בשעה ' || to_char(t.start_time, 'HH24:MI'), '/#/schedule',
              'schedule_tasks', t.id);
    else
      insert into public.notifications (home_id, user_id, type, title, body, link, related_table, related_id)
      select t.home_id, m.user_id, 'task_reminder', 'תזכורת: ' || t.title,
             'מתחיל בשעה ' || to_char(t.start_time, 'HH24:MI'), '/#/schedule',
             'schedule_tasks', t.id
      from public.home_members m where m.home_id = t.home_id;
    end if;

    update public.schedule_tasks set reminded = true where id = t.id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dispatch pending web-push notifications by invoking the edge function.
-- Reads the function URL + cron secret from private.app_config.
-- ---------------------------------------------------------------------------
create or replace function public.dispatch_push()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  fn_url  text;
  secret  text;
begin
  if not exists (select 1 from public.notifications where not push_sent) then
    return;
  end if;

  select value into fn_url from private.app_config where key = 'push_function_url';
  select value into secret from private.app_config where key = 'cron_secret';
  if fn_url is null then return; end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body    := '{}'::jsonb
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Schedule the jobs (unschedule first so re-running is safe)
-- ---------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule('nestly_generate_recurring') where exists (
    select 1 from cron.job where jobname = 'nestly_generate_recurring');
  perform cron.unschedule('nestly_task_reminders') where exists (
    select 1 from cron.job where jobname = 'nestly_task_reminders');
  perform cron.unschedule('nestly_dispatch_push') where exists (
    select 1 from cron.job where jobname = 'nestly_dispatch_push');
end $$;

-- daily at 00:05 UTC: materialize recurring items/tasks
select cron.schedule('nestly_generate_recurring', '5 0 * * *', $$select public.generate_recurring();$$);
-- every 5 minutes: create reminders for imminent tasks
select cron.schedule('nestly_task_reminders', '*/5 * * * *', $$select public.create_task_reminders();$$);
-- every minute: push out any pending notifications
select cron.schedule('nestly_dispatch_push', '* * * * *', $$select public.dispatch_push();$$);
