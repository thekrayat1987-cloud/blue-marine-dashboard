-- 010_security_hardening.sql
-- Move app data access to the server-side service role and remove anon RLS
-- access from dashboard tables. Also add atomic queue claiming helpers so
-- overlapping cron runs cannot send duplicate WhatsApp messages.
--
-- Resilient: only hardens tables that actually exist (this DB never applied
-- all of 001-007), so it won't fail on a missing relation. Idempotent — safe
-- to re-run.

-- 1) Enable RLS + strip anon policies on every dashboard table that exists.
do $$
declare
  t text;
begin
  foreach t in array array[
    'content_post_status',
    'shopify_audit_status',
    'captions_history',
    'ad_planner_history',
    'broadcast_planner_history',
    'content_templates',
    'pending_upsells',
    'pending_review_requests'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists "anon read %s" on public.%I', t, t);
      execute format('drop policy if exists "anon write %s" on public.%I', t, t);
    end if;
  end loop;
end $$;

-- 2) Atomic claim helper for upsells (pending_upsells already exists).
create or replace function public.claim_pending_upsells(
  batch_limit integer,
  max_attempts integer
)
returns setof public.pending_upsells
language sql
security definer
set search_path = public
as $$
  with claimed as (
    select id
    from public.pending_upsells
    where send_status = 'pending'
      and send_at <= now()
      and send_attempts < max_attempts
    order by send_at asc
    for update skip locked
    limit batch_limit
  )
  update public.pending_upsells q
  set send_status = 'processing',
      send_attempts = q.send_attempts + 1,
      send_error = null
  from claimed
  where q.id = claimed.id
  returning q.*;
$$;

revoke all on function public.claim_pending_upsells(integer, integer) from public;
revoke all on function public.claim_pending_upsells(integer, integer) from anon;
revoke all on function public.claim_pending_upsells(integer, integer) from authenticated;
grant execute on function public.claim_pending_upsells(integer, integer) to service_role;

-- 3) Atomic claim helper for review requests (pending_review_requests from 009).
create or replace function public.claim_pending_review_requests(
  batch_limit integer,
  max_attempts integer
)
returns setof public.pending_review_requests
language sql
security definer
set search_path = public
as $$
  with claimed as (
    select id
    from public.pending_review_requests
    where send_status = 'pending'
      and send_at <= now()
      and send_attempts < max_attempts
    order by send_at asc
    for update skip locked
    limit batch_limit
  )
  update public.pending_review_requests q
  set send_status = 'processing',
      send_attempts = q.send_attempts + 1,
      send_error = null
  from claimed
  where q.id = claimed.id
  returning q.*;
$$;

revoke all on function public.claim_pending_review_requests(integer, integer) from public;
revoke all on function public.claim_pending_review_requests(integer, integer) from anon;
revoke all on function public.claim_pending_review_requests(integer, integer) from authenticated;
grant execute on function public.claim_pending_review_requests(integer, integer) to service_role;
