-- "Today in brief", one per home per day. The first phone to open the home
-- screen that day writes it (through the ai edge function); everyone else in the
-- home is served the same text, so a day's summary costs one model call however
-- many people look at it. Refreshing writes a new one for the whole home.

create table if not exists public.ai_summaries (
  home_id    uuid not null references public.homes (id) on delete cascade,
  day        date not null,
  text       text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (home_id, day)
);

-- Members read it; only the ai edge function writes it, with the service role.
alter table public.ai_summaries enable row level security;
create policy ai_summaries_select on public.ai_summaries for select using (public.is_home_member(home_id));
