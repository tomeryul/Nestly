-- Personal tasks (owner-only) and general tasks (shared with the home).
create table if not exists public.personal_tasks (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  owner_id uuid references auth.users (id) on delete cascade,   -- null => general
  scope text not null default 'personal' check (scope in ('personal', 'general')),
  title text not null,
  is_done boolean not null default false,
  position int not null default 0,
  due_date date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.personal_tasks enable row level security;
create index if not exists personal_tasks_home_idx on public.personal_tasks (home_id);

drop policy if exists personal_tasks_select on public.personal_tasks;
create policy personal_tasks_select on public.personal_tasks for select
  using (public.is_home_member(home_id) and (scope = 'general' or owner_id = auth.uid()));
drop policy if exists personal_tasks_write on public.personal_tasks;
create policy personal_tasks_write on public.personal_tasks for insert
  with check (public.is_home_member(home_id) and (scope = 'general' or owner_id = auth.uid()));
drop policy if exists personal_tasks_update on public.personal_tasks;
create policy personal_tasks_update on public.personal_tasks for update
  using (public.is_home_member(home_id) and (scope = 'general' or owner_id = auth.uid()))
  with check (public.is_home_member(home_id) and (scope = 'general' or owner_id = auth.uid()));
drop policy if exists personal_tasks_delete on public.personal_tasks;
create policy personal_tasks_delete on public.personal_tasks for delete
  using (public.is_home_member(home_id) and (scope = 'general' or owner_id = auth.uid()));
