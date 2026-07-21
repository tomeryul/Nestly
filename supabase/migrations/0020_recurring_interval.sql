-- Recurring tasks: support weekly / every 2 weeks / every 4 weeks.
alter table public.recurring_tasks
  add column if not exists interval_weeks int not null default 1 check (interval_weeks in (1, 2, 4));

create or replace function public.generate_recurring(target date default current_date)
returns void language plpgsql security definer set search_path = public as $$
declare dow int := extract(dow from target)::int; r record; default_list uuid;
begin
  for r in select * from public.recurring_shopping_items
    where active and day_of_week = dow and (last_added_on is null or last_added_on < target) loop
    select coalesce(r.target_list_id,
      (select id from public.shopping_lists where home_id = r.home_id order by is_default desc, created_at asc limit 1))
      into default_list;
    if default_list is not null then
      insert into public.shopping_items (list_id, home_id, name, quantity, unit, category, source, created_by)
      values (default_list, r.home_id, r.name, r.quantity, r.unit, r.category, 'recurring', r.created_by);
    end if;
    update public.recurring_shopping_items set last_added_on = target where id = r.id;
  end loop;

  for r in select * from public.recurring_tasks
    where active and day_of_week = dow
      and (last_generated_on is null or (target - last_generated_on) >= interval_weeks * 7) loop
    insert into public.schedule_tasks (home_id, title, description, category, scheduled_date, start_time, end_time, assigned_to, color, recurring_id, created_by)
    values (r.home_id, r.title, r.description, r.category, target, r.start_time, r.end_time, r.assigned_to, r.color, r.id, r.created_by);
    update public.recurring_tasks set last_generated_on = target where id = r.id;
  end loop;
end;
$$;
