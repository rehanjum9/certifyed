-- MULTI-USER CLUB WORKSPACES -- Stage C (part 2) / Stage B (RLS).
--
-- DO NOT APPLY THIS MIGRATION until:
--   1. 0007_organizations.sql and 0008_organization_ownership.sql are applied, and
--   2. scripts/backfill-default-organization.mjs has run successfully and
--      you have verified zero NULL organization_id rows remain (the script
--      prints this count itself; the checks below also fail loudly if not).
--
-- This migration (a) makes organization_id required on the three top-level
-- resource tables, and (b) replaces the previous "RLS enabled, zero
-- policies, service-role only" blanket-deny on templates/template_fields/
-- campaigns/campaign_rows/jobs/fonts with real per-organization RLS.
--
-- Authenticated resource access is READ-ONLY (hardening pass): every real
-- mutation in this app already goes through a guarded Next.js server route
-- using the service-role client, after an organization authorization check
-- (see lib/auth/organizationGuard.ts) -- an authenticated Supabase session
-- has no legitimate reason to write these tables directly, so that
-- capability is removed outright rather than merely scoped. This is the
-- same posture 0007's hardening pass already applied to organizations/
-- organization_members. Application code remains the PRIMARY enforcement
-- layer (the service-role client bypasses RLS entirely), and RLS here is
-- the defense-in-depth layer described in the architecture report, item 5.

do $$
begin
  if exists (select 1 from public.templates where organization_id is null)
    or exists (select 1 from public.campaigns where organization_id is null)
    or exists (select 1 from public.fonts where organization_id is null)
  then
    raise exception 'Refusing to enforce organization ownership: at least one templates/campaigns/fonts row still has a NULL organization_id. Run scripts/backfill-default-organization.mjs first.';
  end if;
end $$;

alter table public.templates
  alter column organization_id set not null;

alter table public.campaigns
  alter column organization_id set not null;

alter table public.fonts
  alter column organization_id set not null;

-- organization_id immutability -----------------------------------------
-- A template/campaign/font's organization_id is its ownership -- fixed at
-- creation, never reassignable afterward. Without this, a user who
-- belongs to both Club A and Club B (a real, supported case -- see the
-- architecture report, item 1: "a user may belong to one or more
-- organizations") could silently move a Club A resource into Club B (or
-- vice versa) with a plain UPDATE, which no RLS SELECT/write policy shape
-- alone prevents -- WITH CHECK on an update policy only constrains what
-- the *new* row is allowed to look like, not that a column must stay
-- unchanged. One reusable trigger function, attached to all three tables
-- that carry organization_id directly. Never interferes with INSERT (the
-- initial organization_id assignment) -- only fires BEFORE UPDATE.
-- SECURITY INVOKER (not DEFINER, unlike 0007's helper functions): this
-- body only compares columns the trigger already hands it (NEW/OLD) and
-- never queries another table, so it needs no elevated privilege at all --
-- DEFINER would grant a capability this function has no use for.
create or replace function public.prevent_organization_id_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.organization_id <> old.organization_id then
    raise exception '%.organization_id cannot be changed; it is fixed when the row is created.', tg_table_name;
  end if;
  return new;
end;
$$;

-- Trigger firing doesn't require the invoking role to hold EXECUTE (same
-- rationale as 0007_organizations.sql's prevent_last_owner_removal /
-- prevent_membership_identity_change) -- revoked from PUBLIC outright,
-- never granted to authenticated/service_role.
revoke all on function public.prevent_organization_id_change() from public;

-- templates ---------------------------------------------------------------
-- Explicit, self-contained privileges: `revoke all` first so nothing here
-- depends on a fresh Supabase project's default per-schema grants, then
-- exactly what's needed is re-granted. Authenticated: SELECT only. The
-- server's service-role client (the only thing that ever creates/edits/
-- deletes a template) keeps full CRUD.
revoke all on table public.templates from public, anon, authenticated;
grant select on table public.templates to authenticated;
grant select, insert, update, delete on table public.templates to service_role;

create policy templates_select_member on public.templates
  for select to authenticated
  using (public.is_organization_member(organization_id));

create trigger templates_prevent_organization_id_change
  before update on public.templates
  for each row execute function public.prevent_organization_id_change();

-- template_fields (child of templates; no organization_id of its own --
-- see the architecture report, item 4: ownership is inherited through the
-- parent template). Same read-only posture: mutations go through
-- saveTemplateFields (lib/templateFields.ts), using service_role after the
-- parent template's organization has already been authorized.

revoke all on table public.template_fields from public, anon, authenticated;
grant select on table public.template_fields to authenticated;
grant select, insert, update, delete on table public.template_fields to service_role;

create policy template_fields_select_member on public.template_fields
  for select to authenticated
  using (
    exists (
      select 1 from public.templates t
      where t.id = template_fields.template_id
        and public.is_organization_member(t.organization_id)
    )
  );

-- campaigns -----------------------------------------------------------------

revoke all on table public.campaigns from public, anon, authenticated;
grant select on table public.campaigns to authenticated;
grant select, insert, update, delete on table public.campaigns to service_role;

create policy campaigns_select_member on public.campaigns
  for select to authenticated
  using (public.is_organization_member(organization_id));

create trigger campaigns_prevent_organization_id_change
  before update on public.campaigns
  for each row execute function public.prevent_organization_id_change();

-- campaign_rows (child of campaigns) ---------------------------------------

revoke all on table public.campaign_rows from public, anon, authenticated;
grant select on table public.campaign_rows to authenticated;
grant select, insert, update, delete on table public.campaign_rows to service_role;

create policy campaign_rows_select_member on public.campaign_rows
  for select to authenticated
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_rows.campaign_id
        and public.is_organization_member(c.organization_id)
    )
  );

-- jobs (child of campaigns) ------------------------------------------------

revoke all on table public.jobs from public, anon, authenticated;
grant select on table public.jobs to authenticated;
grant select, insert, update, delete on table public.jobs to service_role;

create policy jobs_select_member on public.jobs
  for select to authenticated
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = jobs.campaign_id
        and public.is_organization_member(c.organization_id)
    )
  );

-- fonts ---------------------------------------------------------------------
-- Built-in fonts are not rows in this table (see lib/fonts/builtins.ts) --
-- this table has only ever held operator-uploaded custom fonts, now scoped
-- per organization the same way templates/campaigns are. (0006_custom_fonts.sql
-- already revoked all authenticated privileges on this table; the explicit
-- `revoke all` below is a harmless no-op re-statement that keeps this
-- table's privilege block self-contained and identical in shape to every
-- other table here, rather than a special case to remember.)

revoke all on table public.fonts from public, anon, authenticated;
grant select on table public.fonts to authenticated;
grant select, insert, update, delete on table public.fonts to service_role;

create policy fonts_select_member on public.fonts
  for select to authenticated
  using (public.is_organization_member(organization_id));

create trigger fonts_prevent_organization_id_change
  before update on public.fonts
  for each row execute function public.prevent_organization_id_change();
