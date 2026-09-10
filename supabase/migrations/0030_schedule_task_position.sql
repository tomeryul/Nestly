-- Allow manual drag-to-reorder of schedule tasks within a day.
-- Ordering stays time-first by default; a drag simply overrides it.
alter table public.schedule_tasks add column if not exists position int not null default 0;
