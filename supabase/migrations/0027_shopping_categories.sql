-- Home-defined shopping categories, on top of the built-in defaults.
create table if not exists public.shopping_categories (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (home_id, name)
);
alter table public.shopping_categories enable row level security;
create index if not exists shopping_categories_home_idx on public.shopping_categories (home_id);

drop policy if exists shopping_categories_all on public.shopping_categories;
create policy shopping_categories_all on public.shopping_categories for all
  using (public.is_home_member(home_id)) with check (public.is_home_member(home_id));
