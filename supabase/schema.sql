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
  disabled_at     timestamptz,
  disabled_by     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.profiles
  add column if not exists disabled_at timestamptz,
  add column if not exists disabled_by uuid references auth.users(id) on delete set null;

create index if not exists profiles_org_idx on public.profiles(organization_id);

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
