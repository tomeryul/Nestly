-- Subtasks (checklist) for a schedule task.
create table if not exists public.task_subtasks (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.schedule_tasks (id) on delete cascade,
  home_id    uuid not null references public.homes (id) on delete cascade,
  title      text not null,
  is_done    boolean not null default false,
  position   int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.task_subtasks enable row level security;
create index if not exists task_subtasks_task_idx on public.task_subtasks (task_id);

drop policy if exists task_subtasks_all on public.task_subtasks;
create policy task_subtasks_all on public.task_subtasks for all
  using (public.is_home_member(home_id)) with check (public.is_home_member(home_id));
