-- MULTI-USER CLUB WORKSPACES -- Stage C (part 1): staged ownership columns.
--
-- Nullable on purpose: this installation already has real templates,
-- campaigns, and fonts with no organization yet. Making this column
-- NOT NULL in the same migration that adds it would fail outright (or
-- silently force a guessed owner) against that existing data.
--
-- Apply this migration, then run scripts/backfill-default-organization.mjs
-- (which creates one workspace owned by whichever operator you specify and
-- backfills every existing row's organization_id to it), THEN apply
-- 0009_enforce_organization_ownership.sql to make the column required and
-- turn on real per-organization RLS for these tables. Do not apply 0009
-- before the backfill is verified complete -- see the migration report.

alter table public.templates
  add column organization_id uuid references public.organizations(id);

alter table public.campaigns
  add column organization_id uuid references public.organizations(id);

alter table public.fonts
  add column organization_id uuid references public.organizations(id);

create index templates_organization_id_idx on public.templates (organization_id);
create index campaigns_organization_id_idx on public.campaigns (organization_id);
create index fonts_organization_id_idx on public.fonts (organization_id);
