-- HRBP OS — Supabase schema
-- Mirror of applied state on project dhemuvqwqtkrfmzflghx.
--
-- RLS is ENABLED on cases, meetings, investigations. Each table has
-- SELECT / INSERT / UPDATE policies for the `authenticated` role keyed
-- on auth.uid()::text = user_id. There is no DELETE policy.
--
-- Safe to re-run: every statement is idempotent.

create table if not exists public.cases (
  id          text primary key,
  user_id     text not null default 'demo',
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

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

create index if not exists cases_user_idx          on public.cases(user_id);
create index if not exists investigations_user_idx on public.investigations(user_id);
create index if not exists meetings_user_idx       on public.meetings(user_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.cases          enable row level security;
alter table public.investigations enable row level security;
alter table public.meetings       enable row level security;

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
