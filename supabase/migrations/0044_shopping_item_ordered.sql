-- An item can be ordered (online, say) without being bought yet: the order sheet
-- marks it ordered, and it stays on the list until the delivery comes and it is
-- ticked off as usual. Ticking it clears the mark.
alter table public.shopping_items
  add column if not exists is_ordered boolean not null default false;
