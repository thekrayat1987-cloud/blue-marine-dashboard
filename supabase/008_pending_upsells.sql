-- Blue Marine — Post-purchase WhatsApp upsell queue
-- Webhook /api/webhooks/shopify/orders inserts rows here when a daraa order arrives.
-- Cron /api/cron/process-pending-upsells picks due rows and sends the WhatsApp template.
-- Run once via Supabase MCP apply_migration or SQL Editor.

create table if not exists public.pending_upsells (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  shopify_order_id text not null,
  shopify_order_number text,
  customer_first_name text,
  customer_phone text not null,
  customer_locale text not null default 'ar',
  discount_url text not null,
  send_at timestamptz not null,
  sent_at timestamptz,
  send_status text not null default 'pending',
  whatsapp_message_id text,
  send_error text,
  send_attempts integer not null default 0
);

create unique index if not exists pending_upsells_order_unique
  on public.pending_upsells (shopify_order_id);

create index if not exists pending_upsells_due_idx
  on public.pending_upsells (send_at)
  where send_status = 'pending';

alter table public.pending_upsells enable row level security;

drop policy if exists "anon read pending_upsells" on public.pending_upsells;
drop policy if exists "anon write pending_upsells" on public.pending_upsells;

create policy "anon read pending_upsells"
  on public.pending_upsells for select
  to anon using (true);

create policy "anon write pending_upsells"
  on public.pending_upsells for all
  to anon using (true) with check (true);
