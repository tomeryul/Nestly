-- Task lists of their own: a named list on the Tasks page, shared by the people
-- in the home its creator picks. Only those people see the list and its tasks,
-- and any of them can add, tick, rename, change who is in it, or delete it.
--
-- A list's tasks are ordinary personal_tasks rows with list_id set. They are
-- shared ones (scope 'general', no owner): "general" says the task isn't one
-- person's, list_id says whose it is — null for the whole home's general list.

create table if not exists public.task_lists (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  position int not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists task_lists_home_idx on public.task_lists (home_id);

create table if not exists public.task_list_members (
  list_id uuid not null references public.task_lists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (list_id, user_id)
);
create index if not exists task_list_members_user_idx on public.task_list_members (user_id);

alter table public.personal_tasks
  add column if not exists list_id uuid references public.task_lists (id) on delete cascade;
create index if not exists personal_tasks_list_idx on public.personal_tasks (list_id) where list_id is not null;
alter table public.personal_tasks
  add constraint personal_tasks_list_is_shared check (list_id is null or (scope = 'general' and owner_id is null));

-- Membership checks. Security definer so the policies below can ask without
-- tripping over task_list_members' own row-level security.
create or replace function public.is_task_list_member(p_list uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.task_list_members where list_id = p_list and user_id = auth.uid());
$$;

-- A task may go on a list only if the caller is in it and the list is in the task's home.
create or replace function public.can_use_task_list(p_list uuid, p_home uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.task_list_members m join public.task_lists l on l.id = m.list_id
    where m.list_id = p_list and m.user_id = auth.uid() and l.home_id = p_home
  );
$$;

-- Who may put p_user on p_list: someone already in the list — or its creator,
-- while it has nobody yet (the first batch, which includes the creator). The
-- person added must live in the list's home, and so must the caller. Stable, so
-- within one multi-row insert "nobody yet" holds for the whole first batch.
create or replace function public.can_add_to_task_list(p_list uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.task_lists l
    where l.id = p_list
      and exists (select 1 from public.home_members hm where hm.home_id = l.home_id and hm.user_id = p_user)
      and exists (select 1 from public.home_members me where me.home_id = l.home_id and me.user_id = auth.uid())
      and (
        exists (select 1 from public.task_list_members m where m.list_id = l.id and m.user_id = auth.uid())
        or (l.created_by = auth.uid() and not exists (select 1 from public.task_list_members m where m.list_id = l.id))
      )
  );
$$;

alter table public.task_lists enable row level security;
create policy task_lists_select on public.task_lists for select
  using (public.is_home_member(home_id) and public.is_task_list_member(id));
create policy task_lists_insert on public.task_lists for insert
  with check (public.is_home_member(home_id) and created_by = auth.uid());
create policy task_lists_update on public.task_lists for update
  using (public.is_task_list_member(id))
  with check (public.is_home_member(home_id) and public.is_task_list_member(id));
create policy task_lists_delete on public.task_lists for delete
  using (public.is_task_list_member(id));

alter table public.task_list_members enable row level security;
create policy task_list_members_select on public.task_list_members for select
  using (public.is_task_list_member(list_id));
create policy task_list_members_insert on public.task_list_members for insert
  with check (public.can_add_to_task_list(list_id, user_id));
create policy task_list_members_delete on public.task_list_members for delete
  using (public.is_task_list_member(list_id));

-- personal_tasks: a list's tasks are seen and changed only by the list's people.
alter policy personal_tasks_select on public.personal_tasks
  using (public.is_home_member(home_id) and (list_id is null or public.can_use_task_list(list_id, home_id)));
alter policy personal_tasks_write on public.personal_tasks
  with check (public.is_home_member(home_id) and (list_id is null or public.can_use_task_list(list_id, home_id)));
alter policy personal_tasks_update on public.personal_tasks
  using (public.is_home_member(home_id) and (list_id is null or public.can_use_task_list(list_id, home_id)))
  with check (public.is_home_member(home_id) and (list_id is null or public.can_use_task_list(list_id, home_id)));
alter policy personal_tasks_delete on public.personal_tasks
  using (public.is_home_member(home_id) and (list_id is null or public.can_use_task_list(list_id, home_id)) and (scope = 'general' or owner_id = auth.uid()));
