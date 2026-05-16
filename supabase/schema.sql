-- HRBP OS — Supabase schema
-- Mirror of applied state on project dhemuvqwqtkrfmzflghx.
--
-- RLS is ENABLED on cases, meetings, investigations, briefs. Each table has
-- SELECT / INSERT / UPDATE / DELETE policies for the `authenticated` role
-- keyed on private.has_org_access(organization_id) — super_admin sees all
-- orgs, admin/hrbp see their own org (active only), disabled see none.
-- Cutover from per-user (auth.uid()::text = user_id) policies happened in
-- migration `hrbp_os_role_org_scoped_rls` (2026-04-29). user_id is still
-- written by supabaseStore for last-writer/audit purposes but no longer
-- gates visibility.
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
  disabled_at     timestamptz,
  disabled_by     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.profiles
  add column if not exists disabled_at timestamptz,
  add column if not exists disabled_by uuid references auth.users(id) on delete set null;

create index if not exists profiles_org_idx on public.profiles(organization_id);

-- ── allow-list (auth gate) ───────────────────────────────────────────────────
-- public.allowed_users is the post-magic-link admission gate. The frontend
-- (src/lib/auth.js → isEmailAllowed) queries it after Supabase resolves the
-- session: a row read for the JWT's email = access granted, no row = sign-out.
-- /api/signup INSERTs a row server-side (service-role) on workspace creation.
--
-- Live state (project dhemuvqwqtkrfmzflghx, mirrored here 2026-05-16):
--   - id uuid pk default gen_random_uuid()
--   - email text not null UNIQUE   (also functions as the lookup index)
--   - created_at timestamptz default now()
--   - RLS ENABLED with a single SELECT policy `allowed_users_select_self`
--     for role `authenticated`: USING lower(email) = lower(auth.jwt() ->> 'email').
--   - No INSERT/UPDATE/DELETE policies → mutations require service-role
--     (anon/authenticated clients can only read their own row).
create table if not exists public.allowed_users (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  created_at  timestamptz default now()
);

alter table public.allowed_users enable row level security;

drop policy if exists allowed_users_select_self on public.allowed_users;
create policy allowed_users_select_self on public.allowed_users
  as permissive for select to authenticated
  using ( lower(email) = lower(auth.jwt() ->> 'email') );

-- `data` is a jsonb blob holding the case payload; see src/utils/normalize.js
-- for the full schema. Canonical case statuses (data->>'status'):
--   'open' | 'in_progress' | 'waiting' | 'closed' | 'archived'
-- Default for new cases is 'open'. Legacy values (active, pending, resolved,
-- escalated) are migrated on read by normalizeCase. No DDL CHECK here because
-- status validation lives in the JS layer.
--
-- `status` is a top-level mirror of data->>'status' for indexed queries.
-- supabaseStore.saveCases stamps it on every upsert from norm.status, so
-- column and jsonb stay in sync. data.status remains the source of truth.
create table if not exists public.cases (
  id              text primary key,
  user_id         text not null default 'demo',
  data            jsonb not null,
  status          text not null default 'open',
  organization_id uuid references public.organizations(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Migration `hrbp_os_cases_status_column` (2026-05-01): adds the column +
-- backfills legacy data->>'status' values to canonical, then indexes.
alter table public.cases
  add column if not exists status text not null default 'open';

create index if not exists cases_status_idx on public.cases(status);

alter table public.cases
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;

create index if not exists cases_org_idx on public.cases(organization_id);

create table if not exists public.investigations (
  id              text primary key,
  user_id         text not null default 'demo',
  data            jsonb not null,
  organization_id uuid references public.organizations(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.investigations
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;

create table if not exists public.meetings (
  id              text primary key,
  user_id         text not null default 'demo',
  data            jsonb not null,
  organization_id uuid references public.organizations(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.meetings
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;

create table if not exists public.briefs (
  id              text primary key,
  user_id         text not null default 'demo',
  data            jsonb not null,
  organization_id uuid references public.organizations(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.briefs
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;

create index if not exists cases_user_idx          on public.cases(user_id);
create index if not exists investigations_user_idx on public.investigations(user_id);
create index if not exists meetings_user_idx       on public.meetings(user_id);
create index if not exists briefs_user_idx         on public.briefs(user_id);

create index if not exists investigations_org_idx on public.investigations(organization_id);
create index if not exists meetings_org_idx       on public.meetings(organization_id);
create index if not exists briefs_org_idx         on public.briefs(organization_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.cases          enable row level security;
alter table public.investigations enable row level security;
alter table public.meetings       enable row level security;
alter table public.briefs         enable row level security;

-- cases — org-scoped via private.has_org_access (cutover migration
-- `hrbp_os_role_org_scoped_rls`, 2026-04-29). The legacy `cases_*_own`
-- policies were dropped by that migration; the drops are repeated here so
-- a fresh schema apply lands in the right state regardless of starting point.
drop policy if exists cases_select_own on public.cases;
drop policy if exists cases_insert_own on public.cases;
drop policy if exists cases_update_own on public.cases;

drop policy if exists cases_select_org on public.cases;
create policy cases_select_org on public.cases
  for select to authenticated
  using (private.has_org_access(organization_id));

drop policy if exists cases_insert_org on public.cases;
create policy cases_insert_org on public.cases
  for insert to authenticated
  with check (private.has_org_access(organization_id));

drop policy if exists cases_update_org on public.cases;
create policy cases_update_org on public.cases
  for update to authenticated
  using (private.has_org_access(organization_id))
  with check (private.has_org_access(organization_id));

drop policy if exists cases_delete_org on public.cases;
create policy cases_delete_org on public.cases
  for delete to authenticated
  using (private.has_org_access(organization_id));

-- investigations — same org-scoped cutover as cases.
drop policy if exists investigations_select_own on public.investigations;
drop policy if exists investigations_insert_own on public.investigations;
drop policy if exists investigations_update_own on public.investigations;

drop policy if exists investigations_select_org on public.investigations;
create policy investigations_select_org on public.investigations
  for select to authenticated
  using (private.has_org_access(organization_id));

drop policy if exists investigations_insert_org on public.investigations;
create policy investigations_insert_org on public.investigations
  for insert to authenticated
  with check (private.has_org_access(organization_id));

drop policy if exists investigations_update_org on public.investigations;
create policy investigations_update_org on public.investigations
  for update to authenticated
  using (private.has_org_access(organization_id))
  with check (private.has_org_access(organization_id));

drop policy if exists investigations_delete_org on public.investigations;
create policy investigations_delete_org on public.investigations
  for delete to authenticated
  using (private.has_org_access(organization_id));

-- meetings — same org-scoped cutover as cases.
drop policy if exists meetings_select_own on public.meetings;
drop policy if exists meetings_insert_own on public.meetings;
drop policy if exists meetings_update_own on public.meetings;

drop policy if exists meetings_select_org on public.meetings;
create policy meetings_select_org on public.meetings
  for select to authenticated
  using (private.has_org_access(organization_id));

drop policy if exists meetings_insert_org on public.meetings;
create policy meetings_insert_org on public.meetings
  for insert to authenticated
  with check (private.has_org_access(organization_id));

drop policy if exists meetings_update_org on public.meetings;
create policy meetings_update_org on public.meetings
  for update to authenticated
  using (private.has_org_access(organization_id))
  with check (private.has_org_access(organization_id));

drop policy if exists meetings_delete_org on public.meetings;
create policy meetings_delete_org on public.meetings
  for delete to authenticated
  using (private.has_org_access(organization_id));

-- briefs — same org-scoped cutover as cases.
drop policy if exists briefs_select_own on public.briefs;
drop policy if exists briefs_insert_own on public.briefs;
drop policy if exists briefs_update_own on public.briefs;

drop policy if exists briefs_select_org on public.briefs;
create policy briefs_select_org on public.briefs
  for select to authenticated
  using (private.has_org_access(organization_id));

drop policy if exists briefs_insert_org on public.briefs;
create policy briefs_insert_org on public.briefs
  for insert to authenticated
  with check (private.has_org_access(organization_id));

drop policy if exists briefs_update_org on public.briefs;
create policy briefs_update_org on public.briefs
  for update to authenticated
  using (private.has_org_access(organization_id))
  with check (private.has_org_access(organization_id));

drop policy if exists briefs_delete_org on public.briefs;
create policy briefs_delete_org on public.briefs
  for delete to authenticated
  using (private.has_org_access(organization_id));

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

-- ── Disable audit + active-status RLS gate (migration `hrbp_os_disable_audit_and_rls`) ─
-- Soft-disable already exists via profiles.status = 'disabled'. This block adds:
--   - audit columns disabled_at / disabled_by (above)
--   - private.is_admin() now requires status = 'approved' (disabled admin loses powers)
--   - private.is_active() helper (true iff caller is approved)
--   - is_active() guard on cases/meetings/investigations/briefs RLS
--   - is_active()-or-admin guard on organizations SELECT
--   - revoke_user_access / restore_user_access RPCs (admin-only, audit-stamped)
--
-- Helpers live in the `private` schema (created in an earlier migration) so they
-- are not exposed via PostgREST. is_active is added here; is_admin is replaced.

create or replace function private.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'approved'
  );
$$;

create or replace function private.is_active()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'approved'
  );
$$;
revoke execute on function private.is_active() from public, anon;
grant  execute on function private.is_active() to authenticated;

-- Re-issue user-scoped table policies with is_active() guard.
do $$
declare
  t text;
begin
  foreach t in array array['cases','meetings','investigations','briefs'] loop
    execute format('drop policy if exists %I_select_own on public.%I', t, t);
    execute format('drop policy if exists %I_insert_own on public.%I', t, t);
    execute format('drop policy if exists %I_update_own on public.%I', t, t);
    execute format('drop policy if exists %I_delete_own on public.%I', t, t);
    execute format($f$
      create policy %I_select_own on public.%I for select to authenticated
        using ((select auth.uid())::text = user_id and private.is_active())
    $f$, t, t);
    execute format($f$
      create policy %I_insert_own on public.%I for insert to authenticated
        with check ((select auth.uid())::text = user_id and private.is_active())
    $f$, t, t);
    execute format($f$
      create policy %I_update_own on public.%I for update to authenticated
        using ((select auth.uid())::text = user_id and private.is_active())
        with check ((select auth.uid())::text = user_id and private.is_active())
    $f$, t, t);
    execute format($f$
      create policy %I_delete_own on public.%I for delete to authenticated
        using ((select auth.uid())::text = user_id and private.is_active())
    $f$, t, t);
  end loop;
end $$;

drop policy if exists organizations_select_member_or_admin on public.organizations;
create policy organizations_select_member_or_admin on public.organizations for select to authenticated
  using (
    private.is_admin()
    or (private.is_active() and id = private.current_org_id())
  );

create or replace function public.revoke_user_access(target_user_id uuid)
returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  caller_role text;
  caller_status text;
  result public.profiles;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if target_user_id is null then
    raise exception 'target_user_id required' using errcode = '22023';
  end if;
  if target_user_id = caller_id then
    raise exception 'admins cannot revoke their own access' using errcode = '42501';
  end if;
  select role, status into caller_role, caller_status
    from public.profiles where id = caller_id;
  if caller_role is distinct from 'admin' or caller_status is distinct from 'approved' then
    raise exception 'admin only' using errcode = '42501';
  end if;
  update public.profiles
     set status='disabled', disabled_at=now(), disabled_by=caller_id, updated_at=now()
   where id = target_user_id
   returning * into result;
  if result.id is null then
    raise exception 'profile % not found', target_user_id using errcode = 'P0002';
  end if;
  return result;
end;
$$;

create or replace function public.restore_user_access(target_user_id uuid)
returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  caller_role text;
  caller_status text;
  result public.profiles;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if target_user_id is null then
    raise exception 'target_user_id required' using errcode = '22023';
  end if;
  select role, status into caller_role, caller_status
    from public.profiles where id = caller_id;
  if caller_role is distinct from 'admin' or caller_status is distinct from 'approved' then
    raise exception 'admin only' using errcode = '42501';
  end if;
  update public.profiles
     set status='approved', disabled_at=null, disabled_by=null, updated_at=now()
   where id = target_user_id
   returning * into result;
  if result.id is null then
    raise exception 'profile % not found', target_user_id using errcode = 'P0002';
  end if;
  return result;
end;
$$;

revoke execute on function public.revoke_user_access(uuid)  from public, anon;
revoke execute on function public.restore_user_access(uuid) from public, anon;
grant  execute on function public.revoke_user_access(uuid)  to authenticated;
grant  execute on function public.restore_user_access(uuid) to authenticated;

-- ── Role taxonomy: super_admin / admin / hrbp (migration `hrbp_os_role_taxonomy`) ─
-- Replaces the earlier two-tier ('admin' / 'viewer') role with three tiers.
-- Backfills 'viewer' → 'hrbp' and stamps 'super_admin' on samuelchartrand99
-- (the existing approved admin). Adds a CHECK constraint, default 'hrbp', and
-- the helpers / hardened trigger that the rest of the schema builds on:
--   - private.is_admin()         → (admin OR super_admin) AND approved  [REPLACED]
--   - private.is_super_admin()   → role='super_admin' AND approved      [NEW]
--   - private.is_org_admin()     → role='admin' AND approved            [NEW, no super]
--   - private.has_org_access(uuid) → super_admin OR (active AND row's org = caller's)
--   - protect_profile_privileged_fields() trigger now blocks org admins from
--     promoting anyone TO super_admin or demoting an existing super_admin.
--   - handle_new_user, revoke_user_access, restore_user_access updated to
--     align with the new taxonomy (revoke/restore now permit super_admin too).

update public.profiles set role = 'hrbp'        where role = 'viewer';
update public.profiles set role = 'super_admin' where email = 'samuelchartrand99@gmail.com';

alter table public.profiles alter column role set default 'hrbp';
alter table public.profiles alter column role set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_role_check' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('super_admin', 'admin', 'hrbp'));
  end if;
end $$;

create or replace function private.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin', 'super_admin')
      and status = 'approved'
  );
$$;

create or replace function private.is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'super_admin'
      and status = 'approved'
  );
$$;

create or replace function private.is_org_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and status = 'approved'
  );
$$;

create or replace function private.has_org_access(p_org_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    private.is_super_admin()
    or (
      p_org_id is not null
      and private.is_active()
      and p_org_id = private.current_org_id()
    );
$$;

revoke execute on function private.is_super_admin()       from public, anon;
revoke execute on function private.is_org_admin()         from public, anon;
revoke execute on function private.has_org_access(uuid)   from public, anon;
grant  execute on function private.is_super_admin()       to authenticated;
grant  execute on function private.is_org_admin()         to authenticated;
grant  execute on function private.has_org_access(uuid)   to authenticated;

create or replace function private.protect_profile_privileged_fields()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if not private.is_admin() then
    if new.role is distinct from old.role then
      raise exception 'changing role requires admin' using errcode = '42501';
    end if;
    if new.status is distinct from old.status then
      raise exception 'changing status requires admin' using errcode = '42501';
    end if;
    if new.organization_id is distinct from old.organization_id then
      raise exception 'changing organization_id requires admin' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Admin (not super_admin) cannot touch the super_admin tier
  if not private.is_super_admin() then
    if new.role = 'super_admin' and old.role is distinct from 'super_admin' then
      raise exception 'only super_admin can grant the super_admin role'
        using errcode = '42501';
    end if;
    if old.role = 'super_admin' and new.role is distinct from 'super_admin' then
      raise exception 'only super_admin can demote a super_admin'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, status, role)
  values (new.id, new.email, 'pending', 'hrbp')
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.revoke_user_access(target_user_id uuid)
returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  result public.profiles;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if target_user_id is null then
    raise exception 'target_user_id required' using errcode = '22023';
  end if;
  if target_user_id = caller_id then
    raise exception 'admins cannot revoke their own access' using errcode = '42501';
  end if;
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  update public.profiles
     set status='disabled', disabled_at=now(), disabled_by=caller_id, updated_at=now()
   where id = target_user_id
   returning * into result;
  if result.id is null then
    raise exception 'profile % not found', target_user_id using errcode = 'P0002';
  end if;
  return result;
end;
$$;

create or replace function public.restore_user_access(target_user_id uuid)
returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  result public.profiles;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if target_user_id is null then
    raise exception 'target_user_id required' using errcode = '22023';
  end if;
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  update public.profiles
     set status='approved', disabled_at=null, disabled_by=null, updated_at=now()
   where id = target_user_id
   returning * into result;
  if result.id is null then
    raise exception 'profile % not found', target_user_id using errcode = 'P0002';
  end if;
  return result;
end;
$$;

-- ── Org-scoped RLS for data tables (migration `hrbp_os_role_org_scoped_rls`) ─
-- Replaces the per-user `<t>_*_own` policies with role-based, org-scoped
-- `<t>_*_org` policies built on private.has_org_access(uuid):
--   super_admin → all rows
--   admin/hrbp  → rows where organization_id matches caller's org (and active)
-- Rows with NULL organization_id are invisible to non-super_admin; this
-- intentionally hides legacy demo rows without deleting them. INSERT/UPDATE
-- WITH CHECK enforces organization_id = caller's org for non-super_admin, so
-- a member of org A cannot smuggle a row into org B.

do $$
declare
  t text;
begin
  foreach t in array array['cases','meetings','investigations','briefs'] loop
    -- Drop the older per-user policies (and the new names, for re-run safety).
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_org', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_org', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_org', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_org', t);

    execute format($f$
      create policy %I on public.%I
      as permissive for select to authenticated
      using ( private.has_org_access(organization_id) )
    $f$, t || '_select_org', t);

    execute format($f$
      create policy %I on public.%I
      as permissive for insert to authenticated
      with check ( private.has_org_access(organization_id) )
    $f$, t || '_insert_org', t);

    execute format($f$
      create policy %I on public.%I
      as permissive for update to authenticated
      using      ( private.has_org_access(organization_id) )
      with check ( private.has_org_access(organization_id) )
    $f$, t || '_update_org', t);

    execute format($f$
      create policy %I on public.%I
      as permissive for delete to authenticated
      using ( private.has_org_access(organization_id) )
    $f$, t || '_delete_org', t);
  end loop;
end $$;

-- ── set_user_role RPC (migration `hrbp_os_set_user_role_rpc`) ─────────────────
-- super_admin-only. Validates new_role against the allowed set, refuses
-- caller self-demotion (last-super-admin lockout protection), returns the
-- updated profile row. Org admins still call updateProfile / approval flow
-- for status & org changes; this RPC is the sanctioned path for role changes.

create or replace function public.set_user_role(target_user_id uuid, new_role text)
returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  result public.profiles;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if target_user_id is null then
    raise exception 'target_user_id required' using errcode = '22023';
  end if;
  if new_role is null or new_role not in ('super_admin', 'admin', 'hrbp') then
    raise exception 'invalid role: %', new_role using errcode = '22023';
  end if;
  if not private.is_super_admin() then
    raise exception 'super_admin only' using errcode = '42501';
  end if;
  if target_user_id = caller_id and new_role <> 'super_admin' then
    raise exception 'cannot demote yourself' using errcode = '42501';
  end if;

  update public.profiles
     set role = new_role, updated_at = now()
   where id = target_user_id
   returning * into result;

  if result.id is null then
    raise exception 'profile % not found', target_user_id using errcode = 'P0002';
  end if;
  return result;
end;
$$;

revoke execute on function public.set_user_role(uuid, text) from public, anon;
grant  execute on function public.set_user_role(uuid, text) to authenticated;

-- ── case_tasks (migration `hrbp_os_case_tasks_table`) ────────────────────────
-- Per-case action items. Org-scoped via private.has_org_access(organization_id),
-- same pattern as cases/meetings/investigations/briefs:
--   super_admin → all rows
--   admin/hrbp  → rows where organization_id matches caller's org (and active)
--   disabled    → no rows (private.is_active() returns false)

create table if not exists public.case_tasks (
  id              uuid primary key default gen_random_uuid(),
  case_id         text not null references public.cases(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  title           text not null,
  assigned_to     uuid references auth.users(id) on delete set null,
  due_date        date,
  status          text not null default 'open'
                    check (status in ('open','done','cancelled')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists case_tasks_case_idx     on public.case_tasks(case_id);
create index if not exists case_tasks_org_idx      on public.case_tasks(organization_id);
create index if not exists case_tasks_assigned_idx on public.case_tasks(assigned_to);
create index if not exists case_tasks_status_idx   on public.case_tasks(status);

alter table public.case_tasks enable row level security;

drop policy if exists case_tasks_select_org on public.case_tasks;
create policy case_tasks_select_org on public.case_tasks
  as permissive for select to authenticated
  using ( private.has_org_access(organization_id) );

drop policy if exists case_tasks_insert_org on public.case_tasks;
create policy case_tasks_insert_org on public.case_tasks
  as permissive for insert to authenticated
  with check ( private.has_org_access(organization_id) );

drop policy if exists case_tasks_update_org on public.case_tasks;
create policy case_tasks_update_org on public.case_tasks
  as permissive for update to authenticated
  using      ( private.has_org_access(organization_id) )
  with check ( private.has_org_access(organization_id) );

drop policy if exists case_tasks_delete_org on public.case_tasks;
create policy case_tasks_delete_org on public.case_tasks
  as permissive for delete to authenticated
  using ( private.has_org_access(organization_id) );

-- ── case_tasks org-pin trigger (migration `hrbp_os_case_tasks_org_pin_trigger`) ─
-- Pins case_tasks.organization_id to the parent case's organization_id on every
-- INSERT and UPDATE. SECURITY DEFINER so the lookup always sees the parent row
-- regardless of caller visibility; RLS WITH CHECK on case_tasks then evaluates
-- the authoritative org_id against has_org_access(), so cross-org inserts are
-- rejected. Direct UPDATE attempts to change organization_id are silently
-- overridden back to the parent's value, so case_id and organization_id can
-- never diverge.

create or replace function private.set_case_task_org()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  select organization_id into new.organization_id
  from public.cases
  where id = new.case_id;
  return new;
end;
$$;

revoke execute on function private.set_case_task_org() from public, anon;

drop trigger if exists case_tasks_set_org on public.case_tasks;
create trigger case_tasks_set_org
  before insert or update on public.case_tasks
  for each row execute function private.set_case_task_org();

-- ── employees (migration `hrbp_os_employees_table`) ──────────────────────────
-- Org-scoped HR roster. Same RLS pattern as cases/meetings/case_tasks built on
-- private.has_org_access(organization_id):
--   super_admin → all rows
--   admin/hrbp  → rows in their org (and active)
--   disabled    → no rows
-- organization_id is NOT NULL because employees always belong to an org —
-- there are no legacy per-user rows here, unlike cases.

create table if not exists public.employees (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  employee_number   text,
  full_name         text not null,
  job_title         text,
  department        text,
  manager_name      text,
  location          text,
  employment_status text not null default 'active'
    check (employment_status in ('active', 'on_leave', 'terminated')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists employees_org_idx        on public.employees(organization_id);
create index if not exists employees_status_idx     on public.employees(employment_status);
create index if not exists employees_department_idx on public.employees(department);

alter table public.employees enable row level security;

drop policy if exists employees_select_org on public.employees;
create policy employees_select_org on public.employees
  as permissive for select to authenticated
  using ( private.has_org_access(organization_id) );

drop policy if exists employees_insert_org on public.employees;
create policy employees_insert_org on public.employees
  as permissive for insert to authenticated
  with check ( private.has_org_access(organization_id) );

drop policy if exists employees_update_org on public.employees;
create policy employees_update_org on public.employees
  as permissive for update to authenticated
  using      ( private.has_org_access(organization_id) )
  with check ( private.has_org_access(organization_id) );

drop policy if exists employees_delete_org on public.employees;
create policy employees_delete_org on public.employees
  as permissive for delete to authenticated
  using ( private.has_org_access(organization_id) );

-- ── audit_logs (migration `hrbp_os_audit_logs_table`) ────────────────────────
-- Append-only event log for case/task/employee mutations. Same RLS pattern
-- as employees/case_tasks built on private.has_org_access(organization_id):
--   super_admin → all rows
--   admin/hrbp  → rows in their org (and active)
--   disabled    → no rows
-- Append-only: only SELECT and INSERT policies. No UPDATE/DELETE policy →
-- RLS denies by default, so audit rows can't be tampered with from the
-- client. organization_id is NOT NULL — every event belongs to an org.

create table if not exists public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id        uuid references auth.users(id) on delete set null,
  action          text not null,
  entity_type     text not null,
  entity_id       text not null,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists audit_logs_org_idx        on public.audit_logs(organization_id);
create index if not exists audit_logs_actor_idx      on public.audit_logs(actor_id);
create index if not exists audit_logs_entity_idx     on public.audit_logs(entity_type, entity_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select_org on public.audit_logs;
create policy audit_logs_select_org on public.audit_logs
  as permissive for select to authenticated
  using ( private.has_org_access(organization_id) );

drop policy if exists audit_logs_insert_org on public.audit_logs;
create policy audit_logs_insert_org on public.audit_logs
  as permissive for insert to authenticated
  with check ( private.has_org_access(organization_id) );

-- ── case_templates (migration `hrbp_os_case_templates_table`) ────────────────
-- Predefined case shells an HRBP can instantiate from. organization_id NULL
-- means "global template" (cross-org, read-only for non-super); a non-null
-- value scopes the template to that org. RLS:
--   super_admin → all rows, full CRUD
--   admin/hrbp  → SELECT own-org rows + globals; INSERT/UPDATE/DELETE only on
--                 own-org rows (has_org_access(NULL) is false for non-super,
--                 so policies reject mutations to globals server-side).
--   disabled    → no rows
create table if not exists public.case_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  name            text not null,
  default_data    jsonb not null default '{}'::jsonb,
  default_tasks   jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists case_templates_org_idx  on public.case_templates(organization_id);
create index if not exists case_templates_name_idx on public.case_templates(name);

alter table public.case_templates enable row level security;

drop policy if exists case_templates_select_org on public.case_templates;
create policy case_templates_select_org on public.case_templates
  as permissive for select to authenticated
  using (
    private.has_org_access(organization_id)
    or (organization_id is null and private.is_active())
    or (organization_id is null and private.is_super_admin())
  );

drop policy if exists case_templates_insert_org on public.case_templates;
create policy case_templates_insert_org on public.case_templates
  as permissive for insert to authenticated
  with check ( private.has_org_access(organization_id) );

drop policy if exists case_templates_update_org on public.case_templates;
create policy case_templates_update_org on public.case_templates
  as permissive for update to authenticated
  using      ( private.has_org_access(organization_id) )
  with check ( private.has_org_access(organization_id) );

drop policy if exists case_templates_delete_org on public.case_templates;
create policy case_templates_delete_org on public.case_templates
  as permissive for delete to authenticated
  using ( private.has_org_access(organization_id) );

-- ── billing: plans / subscriptions / usage_counters (Sprint 3 — Étape 1) ─────
-- Minimal billing scaffolding. Stripe is NOT wired yet — Stripe-side fields
-- (customer_id, subscription_id, period bounds) are nullable so rows can be
-- seeded manually for local trials before any webhook lands. RLS is left OFF
-- on all three tables for now to mirror the organizations/profiles pattern;
-- policies will land once the auth-gated billing flow ships.
--
-- plans is a global catalog (no organization_id). subscriptions and
-- usage_counters are per-org. usage_counters is keyed (organization_id,
-- metric, period_start) so a single row tracks one metric's value for one
-- billing period — increment via UPSERT.

create table if not exists public.plans (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique,
  name                 text not null,
  monthly_price_cents  integer not null default 0,
  max_users            integer,
  max_cases            integer,
  max_ai_requests      integer,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now()
);

create index if not exists plans_code_idx      on public.plans(code);
create index if not exists plans_is_active_idx on public.plans(is_active);

-- Seed the three default plans. `on conflict (code) do nothing` makes the
-- block idempotent — re-running the schema never overwrites edited plan
-- pricing or limits. NULL on max_* means "unlimited" (interpreted by the
-- billing service / quota checks).
insert into public.plans (code, name, monthly_price_cents, max_users, max_cases, max_ai_requests, is_active)
values
  ('starter',    'Starter',     0,    3,   50,   200,  true),
  ('pro',        'Pro',         4900, 15,  500,  2000, true),
  ('enterprise', 'Enterprise',  19900, null, null, null, true)
on conflict (code) do nothing;

create table if not exists public.subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id) on delete cascade,
  plan_id                 uuid references public.plans(id) on delete set null,
  status                  text not null default 'trialing',
  stripe_customer_id      text,
  stripe_subscription_id  text,
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  trial_ends_at           timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create unique index if not exists subscriptions_org_uidx     on public.subscriptions(organization_id);
create index        if not exists subscriptions_plan_idx     on public.subscriptions(plan_id);
create index        if not exists subscriptions_status_idx   on public.subscriptions(status);
create index        if not exists subscriptions_stripe_sub_idx on public.subscriptions(stripe_subscription_id);

create table if not exists public.usage_counters (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  metric          text not null,
  period_start    timestamptz not null,
  value           bigint not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists usage_counters_org_metric_period_uidx
  on public.usage_counters(organization_id, metric, period_start);
create index if not exists usage_counters_org_idx    on public.usage_counters(organization_id);
create index if not exists usage_counters_metric_idx on public.usage_counters(metric);

-- ── billing RLS + policies + create_starter_trial RPC (Sprint 3 — Étape 2) ──
-- plans is a public catalog (SELECT for any authenticated user). subscriptions
-- and usage_counters are read-only from the client and scoped per-org via
-- private.has_org_access. Mutations land via SECURITY DEFINER RPCs and, later,
-- Stripe webhooks running with the service role — no client INSERT/UPDATE/
-- DELETE policies.
alter table public.plans          enable row level security;
alter table public.subscriptions  enable row level security;
alter table public.usage_counters enable row level security;

drop policy if exists plans_select_authenticated on public.plans;
create policy plans_select_authenticated on public.plans
  as permissive for select to authenticated
  using ( true );

drop policy if exists subscriptions_select_org on public.subscriptions;
create policy subscriptions_select_org on public.subscriptions
  as permissive for select to authenticated
  using ( private.has_org_access(organization_id) );

drop policy if exists usage_counters_select_org on public.usage_counters;
create policy usage_counters_select_org on public.usage_counters
  as permissive for select to authenticated
  using ( private.has_org_access(organization_id) );

-- Idempotent provisioning: returns the existing subscription row if one
-- already exists for the org, otherwise inserts a fresh trialing row pointing
-- at the active 'starter' plan with trial_ends_at = now() + 14 days.
-- super_admin-only.
create or replace function public.create_starter_trial(p_organization_id uuid)
returns public.subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id  uuid;
  v_existing public.subscriptions;
  v_inserted public.subscriptions;
begin
  if not private.is_super_admin() then
    raise exception 'super_admin only' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization_id required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.organizations where id = p_organization_id) then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;

  select id into v_plan_id
  from public.plans
  where code = 'starter' and is_active = true
  limit 1;
  if v_plan_id is null then
    raise exception 'starter plan not found' using errcode = 'P0002';
  end if;

  select * into v_existing
  from public.subscriptions
  where organization_id = p_organization_id
  limit 1;
  if found then
    return v_existing;
  end if;

  insert into public.subscriptions (organization_id, plan_id, status, current_period_start, trial_ends_at)
  values (p_organization_id, v_plan_id, 'trialing', now(), now() + interval '14 days')
  returning * into v_inserted;
  return v_inserted;
end;
$$;

revoke execute on function public.create_starter_trial(uuid) from public;
revoke execute on function public.create_starter_trial(uuid) from anon;
grant  execute on function public.create_starter_trial(uuid) to authenticated;
