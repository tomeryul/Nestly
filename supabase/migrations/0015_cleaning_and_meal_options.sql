-- ============ CLEANING MODULE ============
-- A permanent, editable set of cleaning tasks. weekly/monthly tasks must be
-- completed every week/month; completion is tracked per period so the list
-- "resets" each period without deleting the task.
create table if not exists public.cleaning_tasks (
  id          uuid primary key default gen_random_uuid(),
  home_id     uuid not null references public.homes (id) on delete cascade,
  title       text not null,
  room        text,
  frequency   text not null default 'weekly' check (frequency in ('weekly', 'monthly')),
  assigned_to uuid references auth.users (id) on delete set null,
  position    int not null default 0,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.cleaning_tasks enable row level security;
create index if not exists cleaning_tasks_home_idx on public.cleaning_tasks (home_id);

create table if not exists public.cleaning_completions (
  id               uuid primary key default gen_random_uuid(),
  cleaning_task_id uuid not null references public.cleaning_tasks (id) on delete cascade,
  home_id          uuid not null references public.homes (id) on delete cascade,
  period_key       text not null,          -- weekly: week-start date; monthly: YYYY-MM
  done_by          uuid references auth.users (id) on delete set null,
  done_at          timestamptz not null default now(),
  unique (cleaning_task_id, period_key)
);
alter table public.cleaning_completions enable row level security;
create index if not exists cleaning_completions_task_idx on public.cleaning_completions (cleaning_task_id, period_key);

drop policy if exists cleaning_tasks_all on public.cleaning_tasks;
create policy cleaning_tasks_all on public.cleaning_tasks for all
  using (public.is_home_member(home_id)) with check (public.is_home_member(home_id));
drop policy if exists cleaning_completions_all on public.cleaning_completions;
create policy cleaning_completions_all on public.cleaning_completions for all
  using (public.is_home_member(home_id)) with check (public.is_home_member(home_id));

-- ============ WEEKLY MEAL OPTIONS ============
alter table public.weekly_meals add column if not exists all_week boolean not null default false;
alter table public.weekly_meals add column if not exists for_members uuid[] not null default '{}';
