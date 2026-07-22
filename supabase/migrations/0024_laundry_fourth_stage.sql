-- Laundry now has 4 stages: machine → dry → fold → put-away (פיזור).
-- A load is only "done" once it reaches stage 4, so the Friday reminder must
-- count anything still below stage 4 as unfinished.
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
    where l.week_start = week_start and l.stage < 4 and l.assigned_to is not null
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
