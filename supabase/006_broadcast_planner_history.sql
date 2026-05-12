-- Blue Marine — Broadcast Planner history
-- Stratégie + message WhatsApp générés par Claude pour les broadcasts SuperLemon.
-- Run once via Supabase MCP apply_migration or SQL Editor.

create table if not exists public.broadcast_planner_history (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_type text not null,
  segment_type text not null,
  segment_filter jsonb,
  segment_preview jsonb,
  occasion text,
  promo_code text,
  promo_deadline date,
  tone text,
  selected_product jsonb,
  plan jsonb not null,
  input_tokens integer,
  output_tokens integer
);

create index if not exists broadcast_planner_history_created_at_idx
  on public.broadcast_planner_history (created_at desc);

alter table public.broadcast_planner_history enable row level security;

drop policy if exists "anon read broadcast_planner_history" on public.broadcast_planner_history;
drop policy if exists "anon write broadcast_planner_history" on public.broadcast_planner_history;

create policy "anon read broadcast_planner_history"
  on public.broadcast_planner_history for select
  to anon using (true);

create policy "anon write broadcast_planner_history"
  on public.broadcast_planner_history for all
  to anon using (true) with check (true);
