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
-- campaigns/campaign_rows/jobs/fonts with real per-organization policies,
-- so an authenticated Supabase session (not just service-role server code)
-- can only ever see/write rows belonging to an organization it's a member
-- of. Application code (see lib/auth/organizationGuard.ts) is the primary
-- enforcement layer since every existing route uses the service-role
-- client, which bypasses RLS entirely -- these policies are the defense
-- -in-depth layer described in the architecture report, item 5.

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

-- templates ---------------------------------------------------------------

create policy templates_select_member on public.templates
  for select to authenticated
  using (public.is_organization_member(organization_id));

create policy templates_write_member on public.templates
  for insert to authenticated
  with check (public.is_organization_member(organization_id));

create policy templates_update_member on public.templates
  for update to authenticated
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));

create policy templates_delete_member on public.templates
  for delete to authenticated
  using (public.is_organization_member(organization_id));

-- template_fields (child of templates; no organization_id of its own --
-- see the architecture report, item 4: ownership is inherited through the
-- parent template).

create policy template_fields_select_member on public.template_fields
  for select to authenticated
  using (
    exists (
      select 1 from public.templates t
      where t.id = template_fields.template_id
        and public.is_organization_member(t.organization_id)
    )
  );

create policy template_fields_write_member on public.template_fields
  for all to authenticated
  using (
    exists (
      select 1 from public.templates t
      where t.id = template_fields.template_id
        and public.is_organization_member(t.organization_id)
    )
  )
  with check (
    exists (
      select 1 from public.templates t
      where t.id = template_fields.template_id
        and public.is_organization_member(t.organization_id)
    )
  );

-- campaigns -----------------------------------------------------------------

create policy campaigns_select_member on public.campaigns
  for select to authenticated
  using (public.is_organization_member(organization_id));

create policy campaigns_write_member on public.campaigns
  for insert to authenticated
  with check (public.is_organization_member(organization_id));

create policy campaigns_update_member on public.campaigns
  for update to authenticated
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));

create policy campaigns_delete_member on public.campaigns
  for delete to authenticated
  using (public.is_organization_member(organization_id));

-- campaign_rows (child of campaigns) ---------------------------------------

create policy campaign_rows_select_member on public.campaign_rows
  for select to authenticated
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_rows.campaign_id
        and public.is_organization_member(c.organization_id)
    )
  );

create policy campaign_rows_write_member on public.campaign_rows
  for all to authenticated
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_rows.campaign_id
        and public.is_organization_member(c.organization_id)
    )
  )
  with check (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_rows.campaign_id
        and public.is_organization_member(c.organization_id)
    )
  );

-- jobs (child of campaigns) ------------------------------------------------

create policy jobs_select_member on public.jobs
  for select to authenticated
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = jobs.campaign_id
        and public.is_organization_member(c.organization_id)
    )
  );

create policy jobs_write_member on public.jobs
  for all to authenticated
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = jobs.campaign_id
        and public.is_organization_member(c.organization_id)
    )
  )
  with check (
    exists (
      select 1 from public.campaigns c
      where c.id = jobs.campaign_id
        and public.is_organization_member(c.organization_id)
    )
  );

-- fonts ---------------------------------------------------------------------
-- Built-in fonts are not rows in this table (see lib/fonts/builtins.ts) --
-- this table has only ever held operator-uploaded custom fonts, now scoped
-- per organization the same way templates/campaigns are.
--
-- 0006_custom_fonts.sql explicitly revoked all table-level privileges from
-- `authenticated` (service-role-only access, by design at the time). That
-- revoke must be undone here -- RLS policies alone are not sufficient;
-- Postgres requires the underlying GRANT too, or every row is denied
-- regardless of policy.
grant select, insert, delete on table public.fonts to authenticated;

create policy fonts_select_member on public.fonts
  for select to authenticated
  using (public.is_organization_member(organization_id));

create policy fonts_write_member on public.fonts
  for insert to authenticated
  with check (public.is_organization_member(organization_id));

create policy fonts_delete_member on public.fonts
  for delete to authenticated
  using (public.is_organization_member(organization_id));
