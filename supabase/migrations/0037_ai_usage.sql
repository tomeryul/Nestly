-- A ledger of every AI request, so the app can show how many tokens were used,
-- what they cost, and roughly how much credit is left. The Anthropic API key
-- can't read the account balance, so the balance is calibrated by hand: an
-- owner types in the balance the Anthropic Console shows, and the app subtracts
-- what was spent since.

create table if not exists public.ai_usage (
  id            bigint generated always as identity primary key,
  home_id       uuid not null references public.homes (id) on delete cascade,
  user_id       uuid references auth.users (id) on delete set null,
  action        text not null,
  model         text not null,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd      numeric(12, 6) not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists ai_usage_home_created on public.ai_usage (home_id, created_at desc);

-- Members read their home's ledger. Nobody writes it through the API: only the
-- ai edge function does, with the service role, from the usage Anthropic reports.
alter table public.ai_usage enable row level security;
create policy ai_usage_select on public.ai_usage for select using (public.is_home_member(home_id));

-- The last balance read off the Anthropic Console, and when. (Owners can update
-- homes; everyone in the home can read it.)
alter table public.homes add column if not exists ai_balance_usd numeric(10, 4);
alter table public.homes add column if not exists ai_balance_at timestamptz;
