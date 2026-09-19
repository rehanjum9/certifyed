-- MULTI-USER CLUB WORKSPACES -- workspace-deletion follow-up.
--
-- Additive/replacing only -- does not touch 0001-0009. Safe to apply at any
-- time; 0007's prevent_last_owner_removal trigger is unconditionally
-- CREATE OR REPLACE'd with a strictly narrower exception carved out of it
-- (see below), everything else about it is unchanged.
--
-- BUG this fixes (found testing the platform-admin "Delete workspace"
-- action, deleteOrganizationSafely / DELETE
-- /api/admin/organizations/[organizationId]): deleting an organization with
-- exactly one member (necessarily its sole owner -- 0007's own invariant)
-- failed. Root cause:
--
--   organizations.id  <-(ON DELETE CASCADE)-  organization_members.organization_id
--
-- `DELETE FROM organizations WHERE id = ...` cascades into a real
-- `DELETE FROM organization_members WHERE organization_id = ...`, and that
-- DELETE still fires organization_members' own BEFORE DELETE ROW trigger
-- (prevent_last_owner_removal, 0007_organizations.sql) for every row it
-- removes, including the last owner's. That trigger has no way to tell
-- "the organization itself is intentionally being deleted" apart from "an
-- ordinary DELETE FROM organization_members call is trying to strand this
-- workspace with zero owners" -- so it raised its usual exception and the
-- cascade (and therefore the whole `DELETE FROM organizations` statement)
-- rolled back.
--
-- FIX: the trigger function gains exactly one new early-return, scoped to
-- DELETE only: if the parent organizations row no longer exists, let the
-- delete through unconditionally. This is a safe, purely
-- database-level signal, not a flag anything client-controlled can set --
-- see the function body for the full timing argument (why this row is
-- reliably absent if and only if this delete is part of that same
-- organization's own cascade, or a pre-existing orphan).
--
-- Everything else is untouched: direct removal of the last owner (DELETE)
-- and direct demotion of the last owner (UPDATE ... SET role) are still
-- blocked exactly as before -- both paths still reach the same
-- remaining-owners count and the same exception when the organization
-- itself is very much still alive. organization_id/user_id membership
-- identity immutability (prevent_membership_identity_change) is a
-- completely separate trigger/function, also untouched.
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

  -- Cascade-delete exception (DELETE only -- an UPDATE can never be the
  -- result of a parent organizations row disappearing, so this can never
  -- weaken owner-demotion protection). PostgreSQL implements
  -- `ON DELETE CASCADE` by deleting the referenced parent row first, then
  -- performing a cascade DELETE on the referencing child rows within the
  -- SAME command -- by the time this BEFORE DELETE ROW trigger fires for
  -- that cascade, the parent organizations row is already gone from this
  -- command's view, so a plain NOT EXISTS check reliably tells "this
  -- delete is happening because the organization itself is being deleted"
  -- apart from "someone is trying to delete a membership row out from
  -- under a workspace that's still very much alive." A normal
  -- authenticated session can never manufacture the "organization missing"
  -- half of that condition on its own: nothing except an actual
  -- `DELETE FROM organizations` (service-role only; see 0007's own
  -- privilege grants and requirePlatformAdmin/deleteOrganizationSafely in
  -- application code) can make this NOT EXISTS true, so there is no
  -- browser-controlled or application-level way to trigger this branch
  -- without genuinely deleting the workspace. (A stray already-orphaned
  -- membership row referencing a since-deleted organization -- which
  -- should not exist given the CASCADE, but might from data predating it
  -- -- also correctly passes through here: "the last owner of an
  -- organization that no longer exists" is not a constraint worth
  -- enforcing.)
  if tg_op = 'DELETE' and not exists (select 1 from public.organizations where id = target_org_id) then
    return old;
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

-- CREATE OR REPLACE FUNCTION does not itself change a function's existing
-- ACL (PostgreSQL preserves ownership/permissions across a replace), so
-- 0007's `revoke all ... from public` on this function already still
-- holds. Restated here anyway, harmlessly, purely so this migration is
-- self-contained on its own (same rationale 0009 uses for fonts' identical
-- harmless re-statement).
revoke all on function public.prevent_last_owner_removal() from public;
