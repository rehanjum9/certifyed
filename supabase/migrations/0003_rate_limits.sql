-- P0 hardening: server-side rate limiting, backed by Postgres so it works
-- correctly across multiple serverless instances (no in-memory-only
-- counters, no new paid infrastructure).
--
-- Fixed-window counting: callers compute a bucket_key that already encodes
-- the route, the caller, and the current time window (see lib/rateLimit.ts),
-- then call increment_rate_limit exactly once per request. The INSERT ...
-- ON CONFLICT ... DO UPDATE ... RETURNING is a single atomic statement, so
-- concurrent requests in the same window can never under-count each other.

create table if not exists rate_limits (
  bucket_key text primary key,
  count integer not null default 1,
  window_start timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists rate_limits_window_start_idx on rate_limits(window_start);

alter table rate_limits enable row level security;
-- No policies: this table is only ever touched via the service-role key
-- (server-side rate-limit checks), matching every other table in this
-- schema's security model.

create or replace function increment_rate_limit(p_bucket_key text, p_window_start timestamptz)
returns integer as $$
declare
  new_count integer;
begin
  insert into rate_limits (bucket_key, count, window_start)
  values (p_bucket_key, 1, p_window_start)
  on conflict (bucket_key)
  do update set count = rate_limits.count + 1, updated_at = now()
  returning count into new_count;
  return new_count;
end;
$$ language plpgsql;
