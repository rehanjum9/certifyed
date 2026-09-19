-- MULTI-USER CLUB WORKSPACES -- role simplification.
--
-- Additive only -- does not edit 0001-0010. Collapses the three
-- workspace-level roles (owner/admin/member) down to two (owner/member).
-- Platform admin (platform_admins, requirePlatformAdmin(), /admin/organizations)
-- is a completely separate, system-level concept and is entirely untouched
-- by this migration -- nothing here touches the platform_admins table or
-- any function/policy that reads it.
--
-- Run this migration's numbered steps in order; each is idempotent/safe to
-- re-run except where noted. See the application's own report (accompanying
-- this file) for the exact read-only query to run BEFORE applying this, and
-- for why it is safe to run even if that query finds existing role='admin'
-- rows.

-- STEP 1 -- report + backfill existing 'admin' rows to 'member'. -----------
-- Never silently guessed toward 'owner': every existing organization
-- already has exactly one owner (enforced since 0007's
-- prevent_last_owner_removal trigger), so there is no ambiguity to resolve
-- by promoting anyone -- 'admin' simply stops being a distinct tier and
-- collapses into the same 'member' tier every plain member already has. An
-- operator who deliberately wants a SPECIFIC former admin to become the
-- workspace owner instead should use the new transfer_organization_ownership
-- function (STEP 5 below) AFTER this migration, as its own explicit,
-- separate action -- never something this migration decides on its own.
do $$
declare
  admin_member_count integer;
  admin_invite_count integer;
begin
  select count(*) into admin_member_count from public.organization_members where role = 'admin';
  select count(*) into admin_invite_count from public.organization_invites where role = 'admin';

  raise notice 'Converting % organization_members row(s) and % organization_invites row(s) from role=admin to role=member.',
    admin_member_count, admin_invite_count;
end $$;

update public.organization_members set role = 'member' where role = 'admin';
update public.organization_invites set role = 'member' where role = 'admin';

-- STEP 2 -- pre-flight: refuse to continue if any organization with at
-- least one membership row does not have EXACTLY one owner. This should be
-- impossible given 0007's own last-owner trigger (which has been live since
-- that migration), but this migration is the moment a NEW, stricter
-- "exactly one owner" invariant becomes real (STEP 4) -- so any
-- pre-existing corruption (e.g. from a manual SQL edit that bypassed the
-- trigger) must be surfaced and fixed by hand now, not silently papered
-- over. Organizations with ZERO members (a normal, valid resting state
-- between creation and the initial owner's invite acceptance -- see
-- lib/organizations/organizations.ts#createOrganization) are correctly
-- exempt: they have nothing to count yet.
do $$
declare
  bad_organization_count integer;
begin
  select count(*) into bad_organization_count
  from (
    select organization_id, count(*) filter (where role = 'owner') as owner_count
    from public.organization_members
    group by organization_id
  ) counts
  where owner_count <> 1;

  if bad_organization_count > 0 then
    raise exception
      'Refusing to continue: % organization(s) with existing membership rows do not have exactly one owner. Resolve manually (see this migration''s accompanying report for the diagnostic query) before re-running.',
      bad_organization_count;
  end if;
end $$;

-- STEP 3 -- tighten the role CHECK constraints to owner/member only. -------
-- Constraint names are Postgres's default auto-generated names for 0007's
-- unnamed inline `check (...)` clauses (`<table>_<column>_check`); dropped
-- with IF EXISTS so this is safe even if that assumption is ever wrong --
-- STEP 1 already guarantees no row can violate the new, stricter
-- constraint being added right after, regardless of whether the old one
-- was successfully found and dropped.
alter table public.organization_members drop constraint if exists organization_members_role_check;
alter table public.organization_members add constraint organization_members_role_check check (role in ('owner', 'member'));

alter table public.organization_invites drop constraint if exists organization_invites_role_check;
alter table public.organization_invites add constraint organization_invites_role_check check (role in ('owner', 'member'));

-- STEP 4 -- close the "second owner" gap at the database level. -----------
-- 0007's prevent_last_owner_removal (amended by 0010 for cascade deletes)
-- already guarantees an organization can never drop to ZERO owners via a
-- direct membership DELETE/role-UPDATE. It does NOT guard the other half
-- of "exactly one owner": nothing before this migration stopped a second
-- row for the same organization from being INSERTed or UPDATEd to
-- role='owner', which would leave an organization with two owners
-- indefinitely if nothing else in the same transaction corrected it.
--
-- This is a DEFERRABLE CONSTRAINT TRIGGER (not a plain BEFORE trigger, and
-- not a partial unique index/EXCLUDE constraint -- see the accompanying
-- report for why): it only actually evaluates at COMMIT (or at an
-- explicit SET CONSTRAINTS ALL IMMEDIATE), after every statement in the
-- transaction has run. That is exactly what
-- transfer_organization_ownership (STEP 5) needs: it promotes the new
-- owner and demotes the old one as two separate UPDATEs inside the SAME
-- function/transaction, which briefly (and only ever internally, never
-- observable by any other session) has two 'owner' rows between those two
-- statements. A plain immediate trigger would reject that transient state;
-- this deferred one only ever looks at the FINAL state once the whole
-- transaction is about to commit, so a transfer that nets out to exactly
-- one owner passes, while a transaction that ends with zero or two owners
-- for any organization is rejected and rolled back in its entirety.
--
-- Also mirrors 0010's own cascade-delete exception: if the organization
-- itself no longer exists by the time this deferred check runs (i.e. this
-- row event was part of that organization's own deletion cascade), there
-- is nothing left to enforce.
create or replace function public.enforce_exactly_one_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org_id uuid;
  org_still_exists boolean;
  owner_count integer;
begin
  target_org_id := coalesce(new.organization_id, old.organization_id);

  select exists(select 1 from public.organizations where id = target_org_id) into org_still_exists;
  if not org_still_exists then
    return null; -- return value is ignored for AFTER triggers; nothing to enforce post-deletion.
  end if;

  select count(*) into owner_count
  from public.organization_members
  where organization_id = target_org_id and role = 'owner';

  if owner_count <> 1 then
    raise exception 'Organization % must have exactly one owner (found %).', target_org_id, owner_count;
  end if;

  return null;
end;
$$;

revoke all on function public.enforce_exactly_one_owner() from public;

drop trigger if exists organization_members_exactly_one_owner on public.organization_members;
create constraint trigger organization_members_exactly_one_owner
  after insert or update or delete on public.organization_members
  deferrable initially deferred
  for each row execute function public.enforce_exactly_one_owner();

-- STEP 5 -- atomic ownership transfer. -------------------------------------
-- The only supported way to change who owns a workspace (see Settings ->
-- Workspace -> "Transfer ownership", owner-only). Implemented as a single
-- RPC function specifically so both the promote and demote steps run
-- inside ONE PostgREST/Postgres transaction -- two separate
-- application-level UPDATE calls would each be its own transaction, and a
-- failure between them could leave a real, persisted two-owner (or,
-- worse, momentarily zero-owner-then-error) state. Row locks (`for
-- update`) guard against a concurrent transfer/removal racing the same
-- membership rows. Every precondition is re-checked here, server-side,
-- never trusted from the caller: the caller only supplies which
-- organization and which two user ids -- application code
-- (requireOrganizationOwner + this function's own checks) is responsible
-- for proving the caller actually IS p_current_owner_id.
--
-- SECURITY DEFINER only so this can run with a stable, explicit
-- search_path; it is never granted to `authenticated` (only
-- `service_role`, the same client every other write in this schema goes
-- through -- organization_members has had zero authenticated-role write
-- privileges since 0007), so this grants no capability an authenticated
-- session doesn't already lack.
create or replace function public.transfer_organization_ownership(
  p_organization_id uuid,
  p_current_owner_id uuid,
  p_new_owner_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_owner_role text;
  new_owner_role text;
begin
  if p_current_owner_id = p_new_owner_id then
    raise exception 'p_new_owner_id must be a different member than the current owner.';
  end if;

  select role into current_owner_role
  from public.organization_members
  where organization_id = p_organization_id and user_id = p_current_owner_id
  for update;

  if current_owner_role is distinct from 'owner' then
    raise exception 'p_current_owner_id is not the current owner of this organization.';
  end if;

  select role into new_owner_role
  from public.organization_members
  where organization_id = p_organization_id and user_id = p_new_owner_id
  for update;

  if new_owner_role is null then
    raise exception 'p_new_owner_id is not a member of this organization.';
  end if;

  -- Promote first, demote second -- see this function's own doc comment
  -- above and STEP 4's for exactly why this order, and why it is safe.
  update public.organization_members
  set role = 'owner'
  where organization_id = p_organization_id and user_id = p_new_owner_id;

  update public.organization_members
  set role = 'member'
  where organization_id = p_organization_id and user_id = p_current_owner_id;
end;
$$;

revoke all on function public.transfer_organization_ownership(uuid, uuid, uuid) from public;
grant execute on function public.transfer_organization_ownership(uuid, uuid, uuid) to service_role;
