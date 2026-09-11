-- Deliveries become a staged flow like laundry:
--   0 = הזמנה בוצעה (what was ordered)
--   1 = כתובת משלוח (arrived at a pickup point; the return clock starts here)
--   2 = החבילה נאספה
alter table public.deliveries add column if not exists stage int not null default 0;

-- Backfill existing rows from the flags they already carry.
update public.deliveries
set stage = case
  when picked_up then 2
  when pickup_point_id is not null then 1
  else 0
end
where stage = 0;
