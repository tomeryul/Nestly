-- Totals of the AI ledger per feature since a point in time, for the settings
-- screen: this month's use, and what was spent since the balance was last read
-- off the Anthropic Console. Runs as the caller, so the ledger's row-level
-- security still decides which home's rows count.

create or replace function public.ai_usage_totals(p_home uuid, p_since timestamptz)
returns table (action text, requests bigint, input_tokens bigint, output_tokens bigint, cost_usd numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select u.action, count(*), coalesce(sum(u.input_tokens), 0), coalesce(sum(u.output_tokens), 0), coalesce(sum(u.cost_usd), 0)
  from public.ai_usage u
  where u.home_id = p_home and u.created_at >= p_since
  group by u.action
$$;

grant execute on function public.ai_usage_totals(uuid, timestamptz) to authenticated;
