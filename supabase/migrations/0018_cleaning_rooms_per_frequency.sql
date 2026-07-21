-- Rooms are now scoped to a frequency, so weekly and monthly cleaning have
-- independent room lists (same name can exist in both).
alter table public.cleaning_rooms
  add column if not exists frequency text not null default 'weekly'
  check (frequency in ('weekly', 'monthly'));

alter table public.cleaning_rooms drop constraint if exists cleaning_rooms_home_id_name_key;
alter table public.cleaning_rooms drop constraint if exists cleaning_rooms_home_name_freq_key;
alter table public.cleaning_rooms
  add constraint cleaning_rooms_home_name_freq_key unique (home_id, name, frequency);

insert into public.cleaning_rooms (home_id, name, frequency, position)
select distinct r.home_id, r.name, 'monthly', r.position
from public.cleaning_tasks t
join public.cleaning_rooms r on r.id = t.room_id
where t.frequency = 'monthly' and r.frequency = 'weekly'
on conflict (home_id, name, frequency) do nothing;

update public.cleaning_tasks t
set room_id = mr.id
from public.cleaning_rooms wr
join public.cleaning_rooms mr on mr.home_id = wr.home_id and mr.name = wr.name and mr.frequency = 'monthly'
where t.room_id = wr.id and t.frequency = 'monthly' and wr.frequency = 'weekly';
