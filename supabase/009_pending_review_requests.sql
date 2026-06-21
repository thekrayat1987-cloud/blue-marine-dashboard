-- 009_pending_review_requests.sql
-- Queue table for post-delivery WhatsApp review requests.
-- Mirrors pending_upsells (008). Populated by the orders/create webhook
-- (one row per order, send_at = order time + REVIEW_REQUEST_DELAY_DAYS),
-- drained by /api/cron/process-review-requests.

create table if not exists public.pending_review_requests (
  id                    uuid primary key default gen_random_uuid(),
  shopify_order_id      text not null unique,
  shopify_order_number  text,
  customer_first_name   text,
  customer_phone        text not null,
  customer_locale       text not null default 'ar',
  product_id            text,           -- first line-item product id; cron resolves handle -> review URL
  product_title         text,
  review_url            text,           -- filled in by the cron at send time
  send_at               timestamptz not null,
  send_status           text not null default 'pending',  -- pending | sent | failed | cancelled
  send_attempts         int  not null default 0,
  sent_at               timestamptz,
  whatsapp_message_id   text,
  send_error            text,
  created_at            timestamptz not null default now()
);

-- Cron query: status='pending' AND send_at<=now() AND attempts<max, ordered by send_at.
create index if not exists pending_review_requests_due_idx
  on public.pending_review_requests (send_status, send_at);

-- This table holds customer phone numbers. Do not add permissive anon policies.
-- Runtime access should use SUPABASE_SERVICE_ROLE_KEY from server routes only.
