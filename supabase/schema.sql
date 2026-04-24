-- HRBP OS — Supabase schema (lean, no RLS yet, no auth yet)
-- Run this once in the Supabase SQL editor for project dhemuvqwqtkrfmzflghx.
--
-- ⚠️ RLS is intentionally NOT enabled here. The publishable key currently acts
-- as anon role, so these tables are world-read/write until RLS + auth land.
-- Do NOT store real HR data until those are in place.

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
