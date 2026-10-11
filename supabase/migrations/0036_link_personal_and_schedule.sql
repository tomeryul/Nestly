-- A task on the Tasks page can also be put on the schedule — it then lives in
-- both places at once, as two linked rows, and ticking (or renaming) either one
-- does the same to the other.

alter table public.schedule_tasks
  add column if not exists personal_task_id uuid
  references public.personal_tasks (id) on delete set null;

-- One schedule entry per task.
create unique index if not exists schedule_tasks_personal_task_id_key
  on public.schedule_tasks (personal_task_id) where personal_task_id is not null;

-- Schedule → Tasks. The "distinct from" guard in each direction is what stops
-- the two triggers from bouncing an update back and forth: once both rows agree,
-- the second update matches nothing.
create or replace function public.sync_schedule_to_personal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.personal_tasks p
     set is_done = new.is_done, title = new.title
   where p.id = new.personal_task_id
     and (p.is_done, p.title) is distinct from (new.is_done, new.title);
  return new;
end;
$$;

-- Tasks → Schedule.
create or replace function public.sync_personal_to_schedule()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.schedule_tasks s
     set is_done = new.is_done, title = new.title
   where s.personal_task_id = new.id
     and (s.is_done, s.title) is distinct from (new.is_done, new.title);
  return new;
end;
$$;

create or replace trigger trg_sync_schedule_to_personal
  after update of is_done, title on public.schedule_tasks
  for each row when (new.personal_task_id is not null)
  execute function public.sync_schedule_to_personal();

create or replace trigger trg_sync_personal_to_schedule
  after update of is_done, title on public.personal_tasks
  for each row
  execute function public.sync_personal_to_schedule();

-- Trigger-only functions must not be callable through the REST API.
revoke execute on function public.sync_schedule_to_personal() from public, anon, authenticated;
revoke execute on function public.sync_personal_to_schedule() from public, anon, authenticated;
