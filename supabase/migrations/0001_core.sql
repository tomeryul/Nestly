-- Nestly core schema: profiles, homes, members, invites
-- Extensions
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- create a profile row automatically on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- homes
-- ---------------------------------------------------------------------------
create table if not exists public.homes (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.homes enable row level security;

-- ---------------------------------------------------------------------------
-- home_members
-- responsibilities: array of area keys ('shopping','cooking','schedule')
-- ---------------------------------------------------------------------------
create table if not exists public.home_members (
  id               uuid primary key default gen_random_uuid(),
  home_id          uuid not null references public.homes (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  role             text not null default 'member' check (role in ('owner', 'member')),
  responsibilities text[] not null default '{}',
  created_at       timestamptz not null default now(),
  unique (home_id, user_id)
);
alter table public.home_members enable row level security;
create index if not exists home_members_user_idx on public.home_members (user_id);
create index if not exists home_members_home_idx on public.home_members (home_id);

-- ---------------------------------------------------------------------------
-- home_invites
-- ---------------------------------------------------------------------------
create table if not exists public.home_invites (
  id               uuid primary key default gen_random_uuid(),
  home_id          uuid not null references public.homes (id) on delete cascade,
  code             text not null unique default encode(gen_random_bytes(6), 'hex'),
  email            text,
  role             text not null default 'member' check (role in ('owner', 'member')),
  responsibilities text[] not null default '{}',
  invited_by       uuid not null references auth.users (id) on delete cascade,
  accepted_by      uuid references auth.users (id) on delete set null,
  accepted_at      timestamptz,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default now() + interval '30 days'
);
alter table public.home_invites enable row level security;

-- ---------------------------------------------------------------------------
-- Helper: is the current user a member of home h?  (security definer => no RLS recursion)
-- ---------------------------------------------------------------------------
create or replace function public.is_home_member(h uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.home_members
    where home_id = h and user_id = auth.uid()
  );
$$;

create or replace function public.is_home_owner(h uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.home_members
    where home_id = h and user_id = auth.uid() and role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------
-- profiles: a user can read profiles of people sharing a home, and edit own
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.home_members m1
      join public.home_members m2 on m1.home_id = m2.home_id
      where m1.user_id = auth.uid() and m2.user_id = profiles.id
    )
  );
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert
  with check (id = auth.uid());

-- homes: members can read; owners can update/delete; creation via RPC
drop policy if exists homes_select on public.homes;
create policy homes_select on public.homes for select
  using (public.is_home_member(id));
drop policy if exists homes_update on public.homes;
create policy homes_update on public.homes for update
  using (public.is_home_owner(id)) with check (public.is_home_owner(id));
drop policy if exists homes_delete on public.homes;
create policy homes_delete on public.homes for delete
  using (public.is_home_owner(id));

-- home_members: members can read their home's members; owners manage
drop policy if exists home_members_select on public.home_members;
create policy home_members_select on public.home_members for select
  using (public.is_home_member(home_id));
drop policy if exists home_members_update on public.home_members;
create policy home_members_update on public.home_members for update
  using (public.is_home_owner(home_id) or user_id = auth.uid())
  with check (public.is_home_owner(home_id) or user_id = auth.uid());
drop policy if exists home_members_delete on public.home_members;
create policy home_members_delete on public.home_members for delete
  using (public.is_home_owner(home_id) or user_id = auth.uid());

-- home_invites: owners manage; invited user can read by code (handled via RPC)
drop policy if exists home_invites_select on public.home_invites;
create policy home_invites_select on public.home_invites for select
  using (public.is_home_member(home_id));
drop policy if exists home_invites_insert on public.home_invites;
create policy home_invites_insert on public.home_invites for insert
  with check (public.is_home_owner(home_id));
drop policy if exists home_invites_delete on public.home_invites;
create policy home_invites_delete on public.home_invites for delete
  using (public.is_home_owner(home_id));

-- ---------------------------------------------------------------------------
-- RPC: create_home -> creates home, owner membership, default shopping list
-- ---------------------------------------------------------------------------
create or replace function public.create_home(home_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_home_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.homes (name, created_by)
  values (home_name, auth.uid())
  returning id into new_home_id;

  insert into public.home_members (home_id, user_id, role, responsibilities)
  values (new_home_id, auth.uid(), 'owner', array['shopping', 'cooking', 'schedule']);

  insert into public.shopping_lists (home_id, name, is_default, created_by)
  values (new_home_id, 'רשימת קניות', true, auth.uid());

  return new_home_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: accept_invite -> joins current user to the home for a given code
-- ---------------------------------------------------------------------------
create or replace function public.accept_invite(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.home_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into inv from public.home_invites
  where code = invite_code and expires_at > now()
  limit 1;

  if inv.id is null then
    raise exception 'invalid or expired invite';
  end if;

  insert into public.home_members (home_id, user_id, role, responsibilities)
  values (inv.home_id, auth.uid(), inv.role, inv.responsibilities)
  on conflict (home_id, user_id) do nothing;

  update public.home_invites
  set accepted_by = auth.uid(), accepted_at = now()
  where id = inv.id;

  return inv.home_id;
end;
$$;

-- Read an invite's home name without being a member yet (for the join screen)
create or replace function public.invite_preview(invite_code text)
returns table (home_id uuid, home_name text, valid boolean)
language sql
security definer
set search_path = public
as $$
  select h.id, h.name, (i.expires_at > now())
  from public.home_invites i
  join public.homes h on h.id = i.home_id
  where i.code = invite_code
  limit 1;
$$;
