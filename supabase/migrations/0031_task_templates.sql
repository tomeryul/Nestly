-- A reusable library of schedule tasks, mirroring how `dishes` feeds the weekly
-- menu: pick one and it is added to a chosen day as a real schedule_tasks row.
create table if not exists public.task_templates (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  title text not null,
  category text not null default 'general',
  start_time time,
  end_time time,
  position int not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.task_templates enable row level security;
create index if not exists task_templates_home_idx on public.task_templates (home_id);

drop policy if exists task_templates_all on public.task_templates;
create policy task_templates_all on public.task_templates for all
  using (public.is_home_member(home_id)) with check (public.is_home_member(home_id));
