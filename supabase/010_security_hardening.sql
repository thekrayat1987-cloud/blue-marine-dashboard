-- 010_security_hardening.sql
-- Move app data access to the server-side service role and remove anon RLS
-- access from dashboard tables. Also add atomic queue claiming helpers so
-- overlapping cron runs cannot send duplicate WhatsApp messages.

alter table public.content_post_status enable row level security;
drop policy if exists "anon read content_post_status" on public.content_post_status;
drop policy if exists "anon write content_post_status" on public.content_post_status;

alter table public.shopify_audit_status enable row level security;
drop policy if exists "anon read shopify_audit_status" on public.shopify_audit_status;
drop policy if exists "anon write shopify_audit_status" on public.shopify_audit_status;

alter table public.captions_history enable row level security;
drop policy if exists "anon read captions_history" on public.captions_history;
drop policy if exists "anon write captions_history" on public.captions_history;

alter table public.ad_planner_history enable row level security;
drop policy if exists "anon read ad_planner_history" on public.ad_planner_history;
drop policy if exists "anon write ad_planner_history" on public.ad_planner_history;

alter table public.broadcast_planner_history enable row level security;
drop policy if exists "anon read broadcast_planner_history" on public.broadcast_planner_history;
drop policy if exists "anon write broadcast_planner_history" on public.broadcast_planner_history;

alter table public.content_templates enable row level security;
drop policy if exists "anon read content_templates" on public.content_templates;
drop policy if exists "anon write content_templates" on public.content_templates;

alter table public.pending_upsells enable row level security;
drop policy if exists "anon read pending_upsells" on public.pending_upsells;
drop policy if exists "anon write pending_upsells" on public.pending_upsells;

alter table public.pending_review_requests enable row level security;

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
  set
    send_status = 'processing',
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
  set
    send_status = 'processing',
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
