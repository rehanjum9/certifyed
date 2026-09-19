-- MULTI-USER CLUB WORKSPACES -- Stage A/B: organization/workspace schema,
-- membership, platform admins, invites, per-workspace Gmail connections,
-- and the security-definer helper functions + RLS policies that let
-- Supabase Auth sessions (the "authenticated" role) see/write only what
-- their own organization memberships allow.
--
-- Additive only. Does not touch templates/campaigns/fonts yet -- see
-- 0008_organization_ownership.sql for the (nullable, staged) ownership
-- columns on those tables, and 0009_enforce_organization_ownership.sql for
-- enforcing NOT NULL + enabling real RLS on them once existing data has
-- been backfilled. Apply in that exact order -- see the migration report.

-- organizations ---------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) > 0),
  slug text unique,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- organization_members ---------------------------------------------------
-- user_id references auth.users(id) -- not enforced with a foreign key
-- (auth.users lives in a separate schema managed by Supabase; this app's
-- existing created_by columns follow the same convention of an unchecked
-- uuid rather than a cross-schema FK).

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index organization_members_user_id_idx on public.organization_members (user_id);
create index organization_members_organization_id_idx on public.organization_members (organization_id);

-- organization_id and user_id are a membership row's IDENTITY, not editable
-- attributes: which organization and which user a row represents must
-- never change in place. A "move" is always delete + a freshly-authorized
-- insert (see lib/organizations/invites.ts#acceptInvite), never an UPDATE.
-- This also closes a real bypass of prevent_last_owner_removal below: that
-- trigger only fires on DELETE or on an UPDATE that touches the `role`
-- column, so without this guard an UPDATE that changed only
-- organization_id (or user_id) on the last owner's row -- silently
-- reassigning it away -- would never trip the last-owner check at all.
-- Fires on every UPDATE (not just one naming these columns), so it also
-- catches an UPDATE that leaves them unspecified-but-unchanged (a no-op,
-- allowed) versus one that actually changes the value (rejected).
create or replace function public.prevent_membership_identity_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organization_id <> old.organization_id then
    raise exception 'organization_members.organization_id cannot be changed; delete and re-insert the membership instead.';
  end if;
  if new.user_id <> old.user_id then
    raise exception 'organization_members.user_id cannot be changed; delete and re-insert the membership instead.';
  end if;
  return new;
end;
$$;

-- Trigger functions run as part of the table's own defined behavior, not
-- via a direct role-issued function call -- firing never requires the
-- invoking role to hold EXECUTE, so this is revoked from PUBLIC entirely
-- rather than granted to authenticated/service_role the way the RLS
-- helper functions below are (those ARE called directly, from policy
-- USING/WITH CHECK expressions, which does require EXECUTE).
revoke all on function public.prevent_membership_identity_change() from public;

create trigger organization_members_prevent_identity_change
  before update on public.organization_members
  for each row execute function public.prevent_membership_identity_change();

-- Defense in depth: an organization can never end up with zero owners via
-- any direct table write (application code enforces the same rule before
-- ever reaching this, but this trigger holds even against a bug or a stray
-- manual SQL edit). Fires on both DELETE and role-changing UPDATE.
create or replace function public.prevent_last_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining_owners integer;
  target_org_id uuid;
begin
  target_org_id := coalesce(old.organization_id, new.organization_id);

  if tg_op = 'DELETE' and old.role <> 'owner' then
    return old;
  end if;
  if tg_op = 'UPDATE' and old.role = new.role then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.role <> 'owner' then
    return new;
  end if;

  select count(*) into remaining_owners
  from public.organization_members
  where organization_id = target_org_id
    and role = 'owner'
    and id <> old.id;

  if remaining_owners = 0 then
    raise exception 'Cannot remove the last owner of an organization.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Same rationale as prevent_membership_identity_change above: trigger
-- firing doesn't need EXECUTE granted to any application role, so PUBLIC's
-- default EXECUTE grant (every newly created function gets one) is
-- revoked outright.
revoke all on function public.prevent_last_owner_removal() from public;

create trigger organization_members_prevent_last_owner_removal
  before delete or update of role on public.organization_members
  for each row execute function public.prevent_last_owner_removal();

-- platform_admins ---------------------------------------------------------
-- A short, explicit allowlist of platform administrators (the former
-- single operator becomes the first row here -- see
-- scripts/bootstrap-platform-admin.mjs). Deliberately NOT a role on
-- organization_members: platform admin is an application-wide capability,
-- unrelated to membership in any one workspace (see the P0 privacy rule in
-- the architecture report -- platform admin status must never silently
-- grant workspace data access).

create table public.platform_admins (
  user_id uuid primary key,
  created_at timestamptz not null default now()
);

-- organization_invites -----------------------------------------------------
-- Tracks a pending invitation created via Supabase Auth's
-- admin.inviteUserByEmail. Accepted once the invited user completes
-- /auth/confirm and organization_members gains the matching row (see
-- lib/organizations/invites.ts). Kept even after acceptance/expiry as a
-- short audit trail, not deleted.

create table public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'admin', 'member')),
  invited_by uuid not null,
  accepted_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index organization_invites_organization_id_idx on public.organization_invites (organization_id);
-- Case-insensitive lookup by email is how /auth/confirm resolves a pending
-- invite for the email the user just verified ownership of.
create index organization_invites_email_idx on public.organization_invites (lower(email));

-- email_connections ---------------------------------------------------------
-- One active Gmail connection per organization (Stage F). The refresh
-- token is never stored in plaintext -- see lib/crypto/secretBox.ts; this
-- column holds only its versioned AES-256-GCM envelope.

create table public.email_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  provider text not null default 'gmail' check (provider in ('gmail')),
  sender_email text not null,
  encrypted_refresh_token text not null,
  connected_by uuid,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger email_connections_set_updated_at
  before update on public.email_connections
  for each row execute function public.set_updated_at();

-- gmail_oauth_states ----------------------------------------------------
-- Short-lived, single-use OAuth CSRF/binding state (Stage F, item 16 of
-- the architecture report). Replaces the previous HttpOnly-cookie-only CSRF
-- token: the callback must find this exact row (by hashed state token),
-- confirm it belongs to the requesting user, hasn't expired, and hasn't
-- already been consumed, before it's allowed to attach a Gmail account to
-- an organization. `state_token_hash` (not the raw token) is stored so a
-- database read/dump alone can never replay a still-valid flow.

create table public.gmail_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_token_hash text not null unique,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index gmail_oauth_states_expires_at_idx on public.gmail_oauth_states (expires_at);

-- Row Level Security --------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.platform_admins enable row level security;
alter table public.organization_invites enable row level security;
alter table public.email_connections enable row level security;
alter table public.gmail_oauth_states enable row level security;

-- Secret/internal-state tables: same blanket-deny pattern already used for
-- rate_limits (0003) and fonts (0006) -- this app's Next.js server code
-- always uses the service-role client (which bypasses RLS) for these, and
-- the anon/authenticated Supabase client is never used to read them
-- directly, so no authenticated-role policy is defined at all.
revoke all on table public.platform_admins from public, anon, authenticated;
grant select, insert, delete on table public.platform_admins to service_role;

revoke all on table public.organization_invites from public, anon, authenticated;
grant select, insert, update, delete on table public.organization_invites to service_role;

revoke all on table public.email_connections from public, anon, authenticated;
grant select, insert, update, delete on table public.email_connections to service_role;

revoke all on table public.gmail_oauth_states from public, anon, authenticated;
grant select, insert, update, delete on table public.gmail_oauth_states to service_role;

-- Helper functions --------------------------------------------------------
-- SECURITY DEFINER (with an explicit search_path, per Supabase's documented
-- safe pattern) so an RLS policy on organizations/organization_members can
-- check membership without granting the `authenticated` role direct SELECT
-- on organization_members (which would otherwise leak every member's
-- presence across every org to any signed-in user). No dynamic SQL, no
-- user-controlled identifiers -- both functions take only a fixed uuid
-- argument and auth.uid().

create or replace function public.is_organization_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
  );
$$;

-- Not currently referenced by any policy below -- organizations and
-- organization_members are both authenticated-read-only as of this
-- hardening pass (every admin-gated write goes through a guarded
-- service-role route instead, see those tables' RLS sections). Kept,
-- correctly locked down, as reusable infrastructure for any future
-- admin-scoped RLS policy on another table.
create or replace function public.is_organization_admin(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
  );
$$;

revoke all on function public.is_organization_member(uuid) from public;
revoke all on function public.is_organization_admin(uuid) from public;
revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_organization_member(uuid) to authenticated, service_role;
grant execute on function public.is_organization_admin(uuid) to authenticated, service_role;
grant execute on function public.is_platform_admin() to authenticated, service_role;

-- organizations: READ-ONLY for authenticated clients. Nothing in the app
-- performs a direct Supabase update to this table at all -- creation
-- happens exclusively through the service-role-backed
-- /api/admin/organizations route, and there is no rename/settings-update
-- feature (see lib/organizations/organizations.ts -- every write uses
-- createServiceRoleClient). Explicit `revoke all` first, not just an
-- omitted grant: a fresh Supabase project's default per-schema privileges
-- otherwise grant table access to anon/authenticated independently of
-- anything this migration explicitly grants, so this is a hard reset
-- before re-granting exactly what's needed (item 5: self-contained,
-- explicit privileges -- never relying on implicit defaults).
revoke all on table public.organizations from public, anon, authenticated;
grant select on table public.organizations to authenticated;
grant select, insert, update, delete on table public.organizations to service_role;

create policy organizations_select_member on public.organizations
  for select to authenticated
  using (public.is_organization_member(id));

-- organization_members: SELECT only for authenticated clients -- every
-- mutation (invite acceptance, role change, member removal) already goes
-- through a guarded server route (POST /api/workspace/invites, PATCH/DELETE
-- /api/workspace/members/[userId], /auth/confirm) using the service-role
-- client, only after requireOrganizationAdmin or the equivalent
-- authorization check. Direct authenticated INSERT/UPDATE/DELETE is
-- revoked outright -- not just left unpolicied -- so an authenticated
-- session (e.g. a workspace admin) can never bypass those application
-- safeguards through a raw Supabase client call, such as promoting
-- themselves straight to "owner" or deleting another member without going
-- through the guarded route. The "no zero owners" invariant
-- (prevent_last_owner_removal) and membership-identity immutability
-- (prevent_membership_identity_change) still apply to service_role writes
-- too -- triggers fire regardless of role, RLS bypass or not.
revoke all on table public.organization_members from public, anon, authenticated;
grant select on table public.organization_members to authenticated;
grant select, insert, update, delete on table public.organization_members to service_role;

create policy organization_members_select_member on public.organization_members
  for select to authenticated
  using (public.is_organization_member(organization_id));
