create table if not exists public.laundry_types (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.laundry_types enable row level security;
create index if not exists laundry_types_home_idx on public.laundry_types (home_id);

create table if not exists public.laundry_tasks (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  name text not null,
  stage int not null default 0,
  week_start date not null,
  assigned_to uuid references auth.users (id) on delete set null,
  position int not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.laundry_tasks enable row level security;
create index if not exists laundry_tasks_home_week_idx on public.laundry_tasks (home_id, week_start);

drop policy if exists laundry_types_all on public.laundry_types;
create policy laundry_types_all on public.laundry_types for all
  using (public.is_home_member(home_id)) with check (public.is_home_member(home_id));
drop policy if exists laundry_tasks_all on public.laundry_tasks;
create policy laundry_tasks_all on public.laundry_tasks for all
  using (public.is_home_member(home_id)) with check (public.is_home_member(home_id));

create or replace function public.laundry_reminders()
returns void language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Jerusalem')::date;
  dow int := extract(dow from today)::int;
  week_start date := today - dow;
  rec record;
begin
  if dow <> 5 then return; end if;
  for rec in
    select l.home_id, l.assigned_to as user_id, count(*) as cnt
    from public.laundry_tasks l
    where l.week_start = week_start and l.stage < 3 and l.assigned_to is not null
    group by l.home_id, l.assigned_to
  loop
    if not exists (select 1 from public.notifications n where n.user_id = rec.user_id and n.type = 'laundry_weekly' and n.created_at >= week_start) then
      insert into public.notifications (home_id, user_id, type, title, body, link)
      values (rec.home_id, rec.user_id, 'laundry_weekly', 'תזכורת כביסות 🧺',
              'נשארו ' || rec.cnt || ' כביסות לסיים לפני סוף השבוע', '/#/laundry');
    end if;
  end loop;
end;
$$;
revoke execute on function public.laundry_reminders() from public, anon, authenticated;
select cron.unschedule('nestly_laundry_reminders') where exists (select 1 from cron.job where jobname = 'nestly_laundry_reminders');
select cron.schedule('nestly_laundry_reminders', '5 6 * * *', $$select public.laundry_reminders();$$);
