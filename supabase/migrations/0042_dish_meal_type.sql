-- What a dish is eaten as: lunch or dinner. Null means either (every dish
-- before this, and any the household hasn't set). The planners offer a dish
-- only for meals it fits, and the AI menu places it only there.
alter table public.dishes
  add column if not exists meal_type text check (meal_type in ('lunch', 'dinner'));
