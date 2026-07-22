-- Recurring meals: dishes that should drop into the weekly menu automatically,
-- every week / every 2 weeks / every 4 weeks.
create table if not exists public.recurring_meals (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  dish_id uuid not null references public.dishes (id) on delete cascade,
  day_of_week int,
  all_week boolean not null default false,
  meal_type text,
  for_members uuid[] not null default '{}',
  interval_weeks int not null default 1 check (interval_weeks in (1, 2, 4)),
  active boolean not null default true,
  last_generated_on date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.recurring_meals enable row level security;
create index if not exists recurring_meals_home_idx on public.recurring_meals (home_id);

drop policy if exists recurring_meals_all on public.recurring_meals;
create policy recurring_meals_all on public.recurring_meals for all
  using (public.is_home_member(home_id)) with check (public.is_home_member(home_id));

-- Link generated weekly meals back to their recurring source (for dedupe).
alter table public.weekly_meals add column if not exists recurring_meal_id uuid references public.recurring_meals (id) on delete set null;

create or replace function public.generate_recurring_meals()
returns void language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Jerusalem')::date;
  wk date := today - extract(dow from today)::int;
  wknum int := floor((wk - date '2020-01-05') / 7)::int;
  rec record;
begin
  for rec in select * from public.recurring_meals where active loop
    if (wknum % rec.interval_weeks) <> 0 then continue; end if;
    if not exists (
      select 1 from public.weekly_meals m
      where m.home_id = rec.home_id and m.week_start = wk and m.recurring_meal_id = rec.id
    ) then
      insert into public.weekly_meals (home_id, dish_id, week_start, all_week, day_of_week, meal_type, for_members, created_by, recurring_meal_id)
      values (rec.home_id, rec.dish_id, wk, rec.all_week,
              case when rec.all_week then null else rec.day_of_week end,
              rec.meal_type, rec.for_members, rec.created_by, rec.id);
    end if;
    update public.recurring_meals set last_generated_on = wk where id = rec.id;
  end loop;
end;
$$;
revoke execute on function public.generate_recurring_meals() from public, anon, authenticated;

-- Seed the current week immediately when a recurring meal is created.
create or replace function public.on_recurring_meal_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.generate_recurring_meals();
  return new;
end;
$$;
revoke execute on function public.on_recurring_meal_insert() from public, anon, authenticated;

drop trigger if exists trg_recurring_meal_insert on public.recurring_meals;
create trigger trg_recurring_meal_insert after insert on public.recurring_meals
  for each row execute function public.on_recurring_meal_insert();

-- Daily top-up (idempotent) so new interval weeks fill in.
select cron.unschedule('nestly_recurring_meals') where exists (select 1 from cron.job where jobname = 'nestly_recurring_meals');
select cron.schedule('nestly_recurring_meals', '10 6 * * *', $$select public.generate_recurring_meals();$$);
