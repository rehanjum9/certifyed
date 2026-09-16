-- Adds field sizing modes (fixed / auto_width / fit_text) and max_width.
-- Additive only -- does not drop or rename anything, so it's safe to run
-- against a database that already has real templates/campaigns.
--
-- sizing_mode supersedes the old auto_fit_text boolean as the single
-- source of truth for how a field's text is sized:
--   fixed      - box and font are both static (old auto_fit_text = false)
--   fit_text   - box stays fixed, font shrinks to fit (old auto_fit_text = true)
--   auto_width - box grows to fit the text at the preferred font size, up
--                to max_width, only shrinking font after that limit
--
-- auto_fit_text itself is intentionally left in place, unused by
-- application code from this point on, rather than dropped -- avoiding a
-- destructive schema change on a live database. It can be removed in a
-- later migration once sizing_mode has been confirmed to fully replace it.

alter table template_fields
  add column sizing_mode text not null default 'fixed'
    check (sizing_mode in ('fixed', 'auto_width', 'fit_text')),
  add column max_width numeric;

-- Backfill: existing fields keep identical rendering behavior.
update template_fields
set sizing_mode = 'fit_text'
where auto_fit_text = true;

-- auto_width always needs a concrete growth ceiling; the editor sets a
-- sensible default automatically when a field is switched to this mode.
alter table template_fields
  add constraint template_fields_auto_width_requires_max_width
  check (sizing_mode <> 'auto_width' or max_width is not null);
