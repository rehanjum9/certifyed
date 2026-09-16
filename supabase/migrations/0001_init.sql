-- Bulk Certificate Generator: initial schema
-- Apply via the Supabase SQL Editor, or `supabase db push` if using the CLI.

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- templates -----------------------------------------------------------

create table templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  svg_path text not null,
  svg_width numeric not null,
  svg_height numeric not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger templates_set_updated_at
  before update on templates
  for each row execute function set_updated_at();

-- template_fields -------------------------------------------------------
-- Coordinates (x, y, width, height) are always in the template's own SVG
-- viewBox units, never editor-screen pixels. "email" is intentionally never
-- stored here: it is a dedicated, always-present recipient field handled by
-- campaigns.email_column / campaign_rows.recipient_email, and is never
-- rendered on the certificate.

create table template_fields (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates(id) on delete cascade,
  field_key text not null,
  label text not null,
  x numeric not null,
  y numeric not null,
  width numeric not null,
  height numeric not null,
  font_family text not null default 'Helvetica',
  font_size numeric not null default 24,
  font_weight text not null default 'normal',
  font_color text not null default '#000000',
  text_align text not null default 'left' check (text_align in ('left', 'center', 'right')),
  -- Text fitting: when auto_fit_text is true, rendering shrinks font_size
  -- (bounded by min/max_font_size) so the value fits inside width/height
  -- instead of overflowing the box.
  auto_fit_text boolean not null default false,
  min_font_size numeric,
  max_font_size numeric,
  is_required boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, field_key),
  check (
    not auto_fit_text
    or (min_font_size is not null and max_font_size is not null and min_font_size <= max_font_size)
  )
);

create index template_fields_template_id_idx on template_fields(template_id);

create trigger template_fields_set_updated_at
  before update on template_fields
  for each row execute function set_updated_at();

-- campaigns -------------------------------------------------------------
-- One campaign = one bulk generation run against one template.
-- column_mapping maps source spreadsheet column -> template field_key for
-- the *dynamic, rendered* fields only. email_column is a separate, dedicated
-- pointer to whichever source column supplies the recipient's email address
-- -- it is never one of the field_key mappings and never rendered.

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates(id) on delete restrict,
  name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'mapped', 'previewing', 'queued', 'processing', 'completed', 'failed')),
  source_file_path text,
  source_row_count integer,
  column_mapping jsonb not null default '{}'::jsonb,
  email_column text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger campaigns_set_updated_at
  before update on campaigns
  for each row execute function set_updated_at();

-- campaign_rows -----------------------------------------------------------
-- One row per Excel/CSV row. `data` holds normalized field_key -> value for
-- the dynamic, rendered fields only. `recipient_email` is a dedicated column
-- (never part of `data`, never rendered on the certificate), kept separate
-- from `data` so the "email is mandatory" rule has one clear home.
-- It is nullable at the database level so rows with a missing/invalid email
-- can still be imported and shown as row-level errors in the validation UI;
-- the application layer must still require a valid recipient_email before a
-- row is allowed to proceed to generation or email delivery.
-- `public_verify_id` is unused today but reserved so a future QR
-- verification page needs zero schema migration.

create table campaign_rows (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  row_index integer not null,
  data jsonb not null default '{}'::jsonb,
  recipient_email text,
  status text not null default 'pending'
    check (status in ('pending', 'generating', 'generated', 'emailing', 'sent', 'failed')),
  pdf_path text,
  error_message text,
  email_message_id text,
  emailed_at timestamptz,
  public_verify_id uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, row_index)
);

create index campaign_rows_campaign_id_status_idx on campaign_rows(campaign_id, status);

create trigger campaign_rows_set_updated_at
  before update on campaign_rows
  for each row execute function set_updated_at();

-- jobs --------------------------------------------------------------------
-- Generic batch queue so bulk work runs as many short invocations instead
-- of one long-running request. `locked_at` is a lease used to stop two
-- worker invocations from claiming the same batch.

create table jobs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  job_type text not null check (job_type in ('generate_pdfs', 'send_emails')),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),
  batch_start integer not null,
  batch_end integer not null,
  attempts integer not null default 0,
  last_error text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_status_locked_at_idx on jobs(status, locked_at);

create trigger jobs_set_updated_at
  before update on jobs
  for each row execute function set_updated_at();

-- Row Level Security --------------------------------------------------------
-- No auth exists yet; every read/write goes through server-side API routes
-- using the service role key (which bypasses RLS). Enabling RLS with no
-- policies means the public anon key grants no direct table access even if
-- it were ever exposed client-side.

alter table templates enable row level security;
alter table template_fields enable row level security;
alter table campaigns enable row level security;
alter table campaign_rows enable row level security;
alter table jobs enable row level security;
