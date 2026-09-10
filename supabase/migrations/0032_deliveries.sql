-- Parcel pickup points and the parcels waiting at them.

create table if not exists public.pickup_points (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  name text not null,
  location text,
  closing_time time,
  hold_days int not null default 3,   -- how long a parcel waits before going back to sender
  notes text,
  position int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.pickup_points enable row level security;
create index if not exists pickup_points_home_idx on public.pickup_points (home_id);

drop policy if exists pickup_points_all on public.pickup_points;
create policy pickup_points_all on public.pickup_points for all
  using (public.is_home_member(home_id)) with check (public.is_home_member(home_id));

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  name text not null,
  pickup_point_id uuid references public.pickup_points (id) on delete set null,
  arrived_on date not null default current_date,
  return_by date,                     -- defaults client-side to arrived_on + hold_days
  picked_up boolean not null default false,
  position int not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.deliveries enable row level security;
create index if not exists deliveries_home_idx on public.deliveries (home_id);

drop policy if exists deliveries_all on public.deliveries;
create policy deliveries_all on public.deliveries for all
  using (public.is_home_member(home_id)) with check (public.is_home_member(home_id));
