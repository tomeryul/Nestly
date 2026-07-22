-- Track insertion time so ingredients can be sorted by when they were added.
alter table public.dish_ingredients add column if not exists created_at timestamptz not null default now();
