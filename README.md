# Bulk Certificate Generator

Upload a Canva-exported SVG certificate template, place dynamic fields on it,
then bulk-generate and email personalized PDF certificates from an Excel/CSV
roster. See `/docs` (or the project plan) for the full architecture.

Currently at **Phase 2: SVG template upload, sanitization, storage, and
preview**. Excel parsing, the dynamic field editor, PDF rendering, email,
and job processing are not implemented yet.

## Setup

1. Install dependencies: `npm install`
2. Create a free [Supabase](https://supabase.com) project.
3. Copy `.env.local.example` values into `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — from Project Settings -> API
   - `SUPABASE_SECRET_KEY` — same page, **server-only, never commit or expose to the browser**
4. Apply the schema: open the Supabase SQL Editor and run the contents of
   `supabase/migrations/0001_init.sql`.
5. Create the storage buckets: `npm run setup:storage`
6. Run the app: `npm run dev`, then open http://localhost:3000
7. Verify the Supabase connection: http://localhost:3000/api/health should
   respond `{"ok":true,"templateCount":0}`.
8. Go to http://localhost:3000/templates/new and upload a real Canva-exported
   SVG certificate to try the upload/sanitize/preview flow.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript, no emit
- `npm run test` — Vitest unit tests (SVG sanitization/validation)
- `npm run setup:storage` — create the Supabase storage buckets this app uses
