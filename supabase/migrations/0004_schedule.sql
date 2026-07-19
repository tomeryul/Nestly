-- Nestly schedule module (לוז): weekly calendar tasks + recurring templates

-- ---------------------------------------------------------------------------
-- schedule_tasks : a task on a specific date/time
-- category: general | shopping | cooking | custom
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_tasks (
  id             uuid primary key default gen_random_uuid(),
  home_id        uuid not null references public.homes (id) on delete cascade,
  title          text not null,
  description    text,
  category       text not null default 'general'
                   check (category in ('general', 'shopping', 'cooking', 'custom')),
  scheduled_date date not null,
  start_time     time,
  end_time       time,
  assigned_to    uuid references auth.users (id) on delete set null,
  is_done        boolean not null default false,
  color          text,
  recurring_id   uuid,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);
alter table public.schedule_tasks enable row level security;
create index if not exists schedule_tasks_home_date_idx on public.schedule_tasks (home_id, scheduled_date);

-- ---------------------------------------------------------------------------
-- recurring_tasks : templates that generate schedule_tasks each week
-- day_of_week: 0=Sunday .. 6=Saturday
-- ---------------------------------------------------------------------------
create table if not exists public.recurring_tasks (
  id                uuid primary key default gen_random_uuid(),
  home_id           uuid not null references public.homes (id) on delete cascade,
  title             text not null,
  description       text,
  category          text not null default 'general'
                      check (category in ('general', 'shopping', 'cooking', 'custom')),
  day_of_week       int not null check (day_of_week between 0 and 6),
  start_time        time,
  end_time          time,
  assigned_to       uuid references auth.users (id) on delete set null,
  color             text,
  active            boolean not null default true,
  last_generated_on date,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now()
);
alter table public.recurring_tasks enable row level security;
create index if not exists recurring_tasks_home_idx on public.recurring_tasks (home_id);

-- wire recurring_id FK now that recurring_tasks exists
alter table public.schedule_tasks
  drop constraint if exists schedule_tasks_recurring_id_fkey;
alter table public.schedule_tasks
  add constraint schedule_tasks_recurring_id_fkey
  foreign key (recurring_id) references public.recurring_tasks (id) on delete set null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
drop policy if exists schedule_tasks_all on public.schedule_tasks;
create policy schedule_tasks_all on public.schedule_tasks for all
  using (public.is_home_member(home_id)) with check (public.is_home_member(home_id));

drop policy if exists recurring_tasks_all on public.recurring_tasks;
create policy recurring_tasks_all on public.recurring_tasks for all
  using (public.is_home_member(home_id)) with check (public.is_home_member(home_id));
