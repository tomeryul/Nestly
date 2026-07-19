-- Nestly cooking module: dishes, ingredients, weekly meal plan

-- ---------------------------------------------------------------------------
-- dishes : the "permanent dishes" catalogue (מאכלים קבועים)
-- ---------------------------------------------------------------------------
create table if not exists public.dishes (
  id          uuid primary key default gen_random_uuid(),
  home_id     uuid not null references public.homes (id) on delete cascade,
  name        text not null,
  description text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.dishes enable row level security;
create index if not exists dishes_home_idx on public.dishes (home_id);

-- now that dishes exists, wire up the shopping_items.dish_id FK
alter table public.shopping_items
  drop constraint if exists shopping_items_dish_id_fkey;
alter table public.shopping_items
  add constraint shopping_items_dish_id_fkey
  foreign key (dish_id) references public.dishes (id) on delete set null;

-- ---------------------------------------------------------------------------
-- dish_ingredients
-- ---------------------------------------------------------------------------
create table if not exists public.dish_ingredients (
  id       uuid primary key default gen_random_uuid(),
  dish_id  uuid not null references public.dishes (id) on delete cascade,
  home_id  uuid not null references public.homes (id) on delete cascade,
  name     text not null,
  quantity numeric not null default 1,
  unit     text,
  category text
);
alter table public.dish_ingredients enable row level security;
create index if not exists dish_ingredients_dish_idx on public.dish_ingredients (dish_id);

-- ---------------------------------------------------------------------------
-- weekly_meals : dishes chosen to prepare in a given week
-- ---------------------------------------------------------------------------
create table if not exists public.weekly_meals (
  id             uuid primary key default gen_random_uuid(),
  home_id        uuid not null references public.homes (id) on delete cascade,
  dish_id        uuid not null references public.dishes (id) on delete cascade,
  week_start     date not null,
  day_of_week    int check (day_of_week between 0 and 6),
  meal_type      text check (meal_type in ('breakfast', 'lunch', 'dinner', 'other')),
  added_to_list  boolean not null default false,
  target_list_id uuid references public.shopping_lists (id) on delete set null,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);
alter table public.weekly_meals enable row level security;
create index if not exists weekly_meals_home_week_idx on public.weekly_meals (home_id, week_start);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
drop policy if exists dishes_all on public.dishes;
create policy dishes_all on public.dishes for all
  using (public.is_home_member(home_id)) with check (public.is_home_member(home_id));

drop policy if exists dish_ingredients_all on public.dish_ingredients;
create policy dish_ingredients_all on public.dish_ingredients for all
  using (public.is_home_member(home_id)) with check (public.is_home_member(home_id));

drop policy if exists weekly_meals_all on public.weekly_meals;
create policy weekly_meals_all on public.weekly_meals for all
  using (public.is_home_member(home_id)) with check (public.is_home_member(home_id));

-- ---------------------------------------------------------------------------
-- RPC: add a meal's ingredients into a shopping list.
-- Merges quantities for identical (name, unit) rows that came from a recipe.
-- ---------------------------------------------------------------------------
create or replace function public.add_meal_to_list(meal_id uuid, list_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m   public.weekly_meals%rowtype;
  ing record;
begin
  select * into m from public.weekly_meals where id = meal_id;
  if m.id is null then
    raise exception 'meal not found';
  end if;
  if not public.is_home_member(m.home_id) then
    raise exception 'not authorized';
  end if;

  for ing in
    select * from public.dish_ingredients where dish_id = m.dish_id
  loop
    -- merge into an existing recipe-sourced line for the same product/unit
    update public.shopping_items s
    set quantity = s.quantity + ing.quantity
    where s.list_id = add_meal_to_list.list_id
      and s.dish_id = m.dish_id
      and s.name = ing.name
      and coalesce(s.unit, '') = coalesce(ing.unit, '')
      and s.source = 'recipe';

    if not found then
      insert into public.shopping_items
        (list_id, home_id, name, quantity, unit, category, source, dish_id, created_by)
      values
        (add_meal_to_list.list_id, m.home_id, ing.name, ing.quantity, ing.unit,
         ing.category, 'recipe', m.dish_id, auth.uid());
    end if;
  end loop;

  update public.weekly_meals
  set added_to_list = true, target_list_id = add_meal_to_list.list_id
  where id = meal_id;
end;
$$;
