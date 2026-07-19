-- Nestly shopping module: lists, items, recurring items

-- ---------------------------------------------------------------------------
-- shopping_lists : multiple lists per home, optionally tied to a week
-- ---------------------------------------------------------------------------
create table if not exists public.shopping_lists (
  id         uuid primary key default gen_random_uuid(),
  home_id    uuid not null references public.homes (id) on delete cascade,
  name       text not null,
  week_start date,
  is_default boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.shopping_lists enable row level security;
create index if not exists shopping_lists_home_idx on public.shopping_lists (home_id);

-- ---------------------------------------------------------------------------
-- shopping_items
-- source: manual | recipe | recurring
-- ---------------------------------------------------------------------------
create table if not exists public.shopping_items (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references public.shopping_lists (id) on delete cascade,
  home_id    uuid not null references public.homes (id) on delete cascade,
  name       text not null,
  quantity   numeric not null default 1,
  unit       text,
  category   text,
  is_checked boolean not null default false,
  source     text not null default 'manual' check (source in ('manual', 'recipe', 'recurring')),
  dish_id    uuid, -- FK added in 0003 once dishes exists
  note       text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.shopping_items enable row level security;
create index if not exists shopping_items_list_idx on public.shopping_items (list_id);
create index if not exists shopping_items_home_idx on public.shopping_items (home_id);

-- ---------------------------------------------------------------------------
-- recurring_shopping_items : auto-added to a list on a chosen weekday
-- day_of_week: 0=Sunday .. 6=Saturday
-- ---------------------------------------------------------------------------
create table if not exists public.recurring_shopping_items (
  id             uuid primary key default gen_random_uuid(),
  home_id        uuid not null references public.homes (id) on delete cascade,
  target_list_id uuid references public.shopping_lists (id) on delete set null,
  name           text not null,
  quantity       numeric not null default 1,
  unit           text,
  category       text,
  day_of_week    int not null check (day_of_week between 0 and 6),
  active         boolean not null default true,
  last_added_on  date,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);
alter table public.recurring_shopping_items enable row level security;
create index if not exists recurring_shopping_home_idx on public.recurring_shopping_items (home_id);

-- ---------------------------------------------------------------------------
-- RLS: all scoped to home membership
-- ---------------------------------------------------------------------------
drop policy if exists shopping_lists_all on public.shopping_lists;
create policy shopping_lists_all on public.shopping_lists for all
  using (public.is_home_member(home_id)) with check (public.is_home_member(home_id));

drop policy if exists shopping_items_all on public.shopping_items;
create policy shopping_items_all on public.shopping_items for all
  using (public.is_home_member(home_id)) with check (public.is_home_member(home_id));

drop policy if exists recurring_shopping_all on public.recurring_shopping_items;
create policy recurring_shopping_all on public.recurring_shopping_items for all
  using (public.is_home_member(home_id)) with check (public.is_home_member(home_id));
