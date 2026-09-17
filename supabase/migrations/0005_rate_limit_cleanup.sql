-- P1 SECURITY/RELIABILITY HARDENING
-- rate_limits accumulates one row per (action, caller, time-window) bucket
-- forever with no cleanup, so it grows without bound over the deployment's
-- lifetime. Buckets are only ever relevant within their own window (every
-- window in RATE_LIMITS tops out at 600s / 10 minutes -- see
-- lib/rateLimit.ts), so anything older than a day is unambiguously stale.
--
-- This function is intentionally NOT invoked on every request -- that would
-- add an unnecessary DELETE to the hot path of every rate-limited API call.
-- It's invoked opportunistically at low probability from checkRateLimit()
-- (see lib/rateLimit.ts), and the same function is also safe to wire into a
-- scheduled job later (Supabase's pg_cron, or a Vercel Cron hitting a small
-- admin route) if this project adds a scheduler -- no application code
-- change needed then, just `select public.cleanup_rate_limits();` on a
-- schedule instead of (or in addition to) the opportunistic call.

create or replace function public.cleanup_rate_limits()
returns integer
language plpgsql
security invoker
as $$
declare
  deleted_count integer;
begin
  delete from public.rate_limits
  where window_start < now() - interval '1 day';

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- Server-only, same access model as increment_rate_limit.
revoke all on function public.cleanup_rate_limits() from public;
revoke all on function public.cleanup_rate_limits() from anon;
revoke all on function public.cleanup_rate_limits() from authenticated;
grant execute on function public.cleanup_rate_limits() to service_role;
