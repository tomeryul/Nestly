-- Nestly notifications module: in-app notifications, web-push subscriptions, triggers

-- ---------------------------------------------------------------------------
-- notifications : in-app inbox (also the queue the push cron reads from)
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  home_id       uuid not null references public.homes (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  type          text not null default 'general',
  title         text not null,
  body          text,
  link          text,
  related_table text,
  related_id    uuid,
  is_read       boolean not null default false,
  push_sent     boolean not null default false,
  created_at    timestamptz not null default now()
);
alter table public.notifications enable row level security;
create index if not exists notifications_user_idx on public.notifications (user_id, is_read);
create index if not exists notifications_push_idx on public.notifications (push_sent) where push_sent = false;

-- ---------------------------------------------------------------------------
-- push_subscriptions : browser Web Push endpoints (one per device/browser)
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- notifications: recipients read/update (mark read) their own
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select
  using (user_id = auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete
  using (user_id = auth.uid());
-- members may create notifications for people in the same home (e.g. assigning a task)
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert
  with check (public.is_home_member(home_id));

-- push_subscriptions: user manages own
drop policy if exists push_subscriptions_all on public.push_subscriptions;
create policy push_subscriptions_all on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Helper: create a notification for every member responsible for an area
-- ---------------------------------------------------------------------------
create or replace function public.notify_responsible(
  p_home_id       uuid,
  p_area          text,
  p_type          text,
  p_title         text,
  p_body          text,
  p_link          text,
  p_related_table text default null,
  p_related_id    uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (home_id, user_id, type, title, body, link, related_table, related_id)
  select p_home_id, m.user_id, p_type, p_title, p_body, p_link, p_related_table, p_related_id
  from public.home_members m
  where m.home_id = p_home_id
    and p_area = any (m.responsibilities);
end;
$$;

-- ---------------------------------------------------------------------------
-- Trigger: when a meal is planned, alert whoever handles shopping to set a
-- shopping day/time for that week.
-- ---------------------------------------------------------------------------
create or replace function public.on_weekly_meal_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dish_name text;
begin
  select name into dish_name from public.dishes where id = new.dish_id;

  perform public.notify_responsible(
    new.home_id,
    'shopping',
    'meal_planned',
    'נקבע בישול חדש לשבוע',
    coalesce(dish_name, 'מאכל') || ' נוסף לתפריט השבוע — צריך לקבוע יום ושעה לקניות',
    '/#/schedule',
    'weekly_meals',
    new.id
  );
  return new;
end;
$$;

drop trigger if exists trg_weekly_meal_insert on public.weekly_meals;
create trigger trg_weekly_meal_insert
  after insert on public.weekly_meals
  for each row execute function public.on_weekly_meal_insert();
