-- CERTIFICATE FONT SYSTEM
-- Metadata for operator-uploaded custom certificate fonts. The actual font
-- file bytes live in the private "certificate-fonts" Storage bucket (see
-- scripts/setup-storage.mjs); this table only tracks the safe UUID-derived
-- storage path and display metadata, never a user-controlled filename as
-- the storage path itself.
--
-- template_fields.font_family is reused, unchanged, as a stable font id:
-- for a built-in font it already stores a PDFKit standard-14 name
-- ("Helvetica", "Times-Roman", "Courier" -- unaffected by this migration),
-- and for a custom font it now stores this table's `id`. No schema change
-- to template_fields is required, so every existing template field keeps
-- working exactly as before with zero backfill.

create table public.fonts (
  id uuid primary key default gen_random_uuid(),
  -- Best-effort read from the font file's own internal name table (see
  -- lib/fonts/parseMetadata.ts); falls back to a cleaned-up filename when
  -- metadata can't be read. Display-only, never used as a storage path.
  display_name text not null,
  -- Kept for the management UI/audit trail only -- never used to build a
  -- storage path (that's always the UUID-derived path below).
  original_filename text not null,
  storage_path text not null unique,
  format text not null check (format in ('ttf', 'otf')),
  font_weight text not null default 'normal' check (font_weight in ('normal', 'bold')),
  file_size integer not null check (file_size > 0),
  created_by uuid,
  created_at timestamptz not null default now()
);

create index fonts_created_at_idx on public.fonts (created_at desc);

-- Default-deny for normal Supabase clients -- same server-only access
-- model as every other table in this single-operator app.
alter table public.fonts enable row level security;

revoke all on table public.fonts from public;
revoke all on table public.fonts from anon;
revoke all on table public.fonts from authenticated;

grant select, insert, delete
  on table public.fonts
  to service_role;
