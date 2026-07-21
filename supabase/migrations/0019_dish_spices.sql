-- Spices belong to a dish but are NOT added to the shopping list.
alter table public.dish_ingredients add column if not exists is_spice boolean not null default false;

create or replace function public.add_meal_to_list(meal_id uuid, list_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.weekly_meals%rowtype; ing record;
begin
  select * into m from public.weekly_meals where id = meal_id;
  if m.id is null then raise exception 'meal not found'; end if;
  if not public.is_home_member(m.home_id) then raise exception 'not authorized'; end if;
  for ing in select * from public.dish_ingredients where dish_id = m.dish_id and not is_spice loop
    update public.shopping_items s set quantity = s.quantity + ing.quantity
    where s.list_id = add_meal_to_list.list_id and s.dish_id = m.dish_id
      and s.name = ing.name and coalesce(s.unit, '') = coalesce(ing.unit, '') and s.source = 'recipe';
    if not found then
      insert into public.shopping_items (list_id, home_id, name, quantity, unit, category, source, dish_id, created_by)
      values (add_meal_to_list.list_id, m.home_id, ing.name, ing.quantity, ing.unit, ing.category, 'recipe', m.dish_id, auth.uid());
    end if;
  end loop;
  update public.weekly_meals set added_to_list = true, target_list_id = add_meal_to_list.list_id where id = meal_id;
end;
$$;
