-- P0 SECURITY HARDENING
-- Persistent fixed-window rate limiting for serverless deployments.
--
-- The application computes a bucket_key containing:
-- - route/action
-- - caller identity
-- - current time window
--
-- increment_rate_limit() atomically increments the counter so concurrent
-- requests cannot under-count each other.
--
-- This table and RPC are server-only. Browser-facing anon/authenticated
-- roles are explicitly denied access. The service-role key is used only
-- from server-side code.

create table if not exists public.rate_limits (
  bucket_key text primary key,
  count integer not null default 1,
  window_start timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists rate_limits_window_start_idx
  on public.rate_limits (window_start);

-- Default-deny for normal Supabase clients.
alter table public.rate_limits enable row level security;

-- Explicit table permissions.
revoke all on table public.rate_limits from public;
revoke all on table public.rate_limits from anon;
revoke all on table public.rate_limits from authenticated;

grant select, insert, update, delete
  on table public.rate_limits
  to service_role;

-- Atomically increment one rate-limit bucket.
create or replace function public.increment_rate_limit(
  p_bucket_key text,
  p_window_start timestamptz
)
returns integer
language plpgsql
security invoker
as $$
declare
  new_count integer;
begin
  insert into public.rate_limits as rl (
    bucket_key,
    count,
    window_start
  )
  values (
    p_bucket_key,
    1,
    p_window_start
  )
  on conflict (bucket_key)
  do update
    set
      count = rl.count + 1,
      updated_at = now()
  returning count into new_count;

  return new_count;
end;
$$;

-- PostgreSQL functions may otherwise be executable by PUBLIC.
-- Keep this RPC server-only.
revoke all
  on function public.increment_rate_limit(text, timestamptz)
  from public;

revoke all
  on function public.increment_rate_limit(text, timestamptz)
  from anon;

revoke all
  on function public.increment_rate_limit(text, timestamptz)
  from authenticated;

grant execute
  on function public.increment_rate_limit(text, timestamptz)
  to service_role;