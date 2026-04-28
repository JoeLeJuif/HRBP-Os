-- HRBP OS — Supabase schema
-- Mirror of applied state on project dhemuvqwqtkrfmzflghx.
--
-- RLS is ENABLED on cases, meetings, investigations, briefs. Each table has
-- SELECT / INSERT / UPDATE policies for the `authenticated` role keyed
-- on auth.uid()::text = user_id. There is no DELETE policy.
--
-- RLS is INTENTIONALLY OFF on profiles and organizations — filtering
-- enforcement comes in a later step.
--
-- Safe to re-run: every statement is idempotent.

create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text,
  status          text not null default 'pending',
  role            text not null default 'viewer',
  organization_id uuid references public.organizations(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists profiles_org_idx on public.profiles(organization_id);

create table if not exists public.cases (
  id              text primary key,
  user_id         text not null default 'demo',
  data            jsonb not null,
  organization_id uuid references public.organizations(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.cases
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;

create index if not exists cases_org_idx on public.cases(organization_id);

create table if not exists public.investigations (
  id          text primary key,
  user_id     text not null default 'demo',
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.meetings (
  id          text primary key,
  user_id     text not null default 'demo',
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.briefs (
  id          text primary key,
  user_id     text not null default 'demo',
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists cases_user_idx          on public.cases(user_id);
create index if not exists investigations_user_idx on public.investigations(user_id);
create index if not exists meetings_user_idx       on public.meetings(user_id);
create index if not exists briefs_user_idx         on public.briefs(user_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.cases          enable row level security;
alter table public.investigations enable row level security;
alter table public.meetings       enable row level security;
alter table public.briefs         enable row level security;

-- cases
drop policy if exists cases_select_own on public.cases;
create policy cases_select_own on public.cases
  for select to authenticated
  using (auth.uid()::text = user_id);

drop policy if exists cases_insert_own on public.cases;
create policy cases_insert_own on public.cases
  for insert to authenticated
  with check (auth.uid()::text = user_id);

drop policy if exists cases_update_own on public.cases;
create policy cases_update_own on public.cases
  for update to authenticated
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

-- investigations
drop policy if exists investigations_select_own on public.investigations;
create policy investigations_select_own on public.investigations
  for select to authenticated
  using (auth.uid()::text = user_id);

drop policy if exists investigations_insert_own on public.investigations;
create policy investigations_insert_own on public.investigations
  for insert to authenticated
  with check (auth.uid()::text = user_id);

drop policy if exists investigations_update_own on public.investigations;
create policy investigations_update_own on public.investigations
  for update to authenticated
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

-- meetings
drop policy if exists meetings_select_own on public.meetings;
create policy meetings_select_own on public.meetings
  for select to authenticated
  using (auth.uid()::text = user_id);

drop policy if exists meetings_insert_own on public.meetings;
create policy meetings_insert_own on public.meetings
  for insert to authenticated
  with check (auth.uid()::text = user_id);

drop policy if exists meetings_update_own on public.meetings;
create policy meetings_update_own on public.meetings
  for update to authenticated
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

-- briefs
drop policy if exists briefs_select_own on public.briefs;
create policy briefs_select_own on public.briefs
  for select to authenticated
  using (auth.uid()::text = user_id);

drop policy if exists briefs_insert_own on public.briefs;
create policy briefs_insert_own on public.briefs
  for insert to authenticated
  with check (auth.uid()::text = user_id);

drop policy if exists briefs_update_own on public.briefs;
create policy briefs_update_own on public.briefs
  for update to authenticated
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

-- ── Auth → profile bootstrap ─────────────────────────────────────────────────
-- Every new auth.users row gets a profile with status='pending', role='viewer'.
-- SECURITY DEFINER bypasses RLS so the trigger works regardless of caller role.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, status, role)
  values (new.id, new.email, 'pending', 'viewer')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
