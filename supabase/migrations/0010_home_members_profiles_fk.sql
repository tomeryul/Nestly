-- The app embeds profiles in home_members: select("*, profile:profiles(display_name)").
-- That embed needs a foreign key PostgREST can follow. home_members.user_id and
-- profiles.id both reference auth.users independently, so there was no direct
-- relationship and the request failed with HTTP 400 — which broke the member
-- list, display-name editing, owner detection and the invite button.
--
-- Backfill any missing profile rows, then add the FK.
insert into public.profiles (id)
select distinct m.user_id from public.home_members m
where not exists (select 1 from public.profiles p where p.id = m.user_id)
on conflict (id) do nothing;

alter table public.home_members
  drop constraint if exists home_members_user_id_profiles_fkey;
alter table public.home_members
  add constraint home_members_user_id_profiles_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;
