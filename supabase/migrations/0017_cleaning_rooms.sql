-- First-class rooms so a cleaning list can be built room-by-room (rooms exist
-- even before they have tasks), reused every period.
create table if not exists public.cleaning_rooms (
  id         uuid primary key default gen_random_uuid(),
  home_id    uuid not null references public.homes (id) on delete cascade,
  name       text not null,
  position   int not null default 0,
  created_at timestamptz not null default now(),
  unique (home_id, name)
);
alter table public.cleaning_rooms enable row level security;
create index if not exists cleaning_rooms_home_idx on public.cleaning_rooms (home_id);

drop policy if exists cleaning_rooms_all on public.cleaning_rooms;
create policy cleaning_rooms_all on public.cleaning_rooms for all
  using (public.is_home_member(home_id)) with check (public.is_home_member(home_id));

alter table public.cleaning_tasks add column if not exists room_id uuid references public.cleaning_rooms (id) on delete set null;

-- migrate any existing free-text rooms into the new table
insert into public.cleaning_rooms (home_id, name)
select distinct home_id, btrim(room) from public.cleaning_tasks
where room is not null and btrim(room) <> ''
on conflict (home_id, name) do nothing;

update public.cleaning_tasks t
set room_id = r.id
from public.cleaning_rooms r
where r.home_id = t.home_id and r.name = btrim(t.room) and t.room_id is null;
