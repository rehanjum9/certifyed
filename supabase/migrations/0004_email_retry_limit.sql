-- P1 SECURITY HARDENING
-- Bounds how many times a single row's email delivery can be retried.
--
-- Without this, an operator (or, if this ever becomes automated, a retry
-- loop) could re-queue a permanently-failing row (e.g. a hard-bouncing
-- address, or a provider rejecting it every time) indefinitely, burning
-- provider quota and repeatedly hammering the same recipient. This column
-- is incremented once per real send attempt (success or failure) in
-- lib/campaigns/emailDelivery.ts; isEligibleForEmailRetry there stops
-- offering a row for retry once it reaches MAX_EMAIL_ATTEMPTS.
--
-- Existing rows default to 0, which is correct: nothing has attempted email
-- delivery differently than this migration assumes, so no row is
-- incorrectly grandfathered into "exhausted".

alter table public.campaign_rows
  add column if not exists email_attempts integer not null default 0;
