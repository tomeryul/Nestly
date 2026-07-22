-- Allow manual drag-to-reorder of shopping items.
alter table public.shopping_items add column if not exists position int not null default 0;
