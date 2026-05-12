-- Blue Marine — captions history (Instagram + TikTok)
-- Run this once in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/wqjrsmefeipvkorlbynz/sql/new

create table if not exists public.captions_history (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  keywords text not null,
  occasion text,
  platforms text[] not null,
  languages text[] not null,
  tone text not null,
  objective text not null,
  framework text not null,
  product_info jsonb,
  variants jsonb not null,
  input_tokens integer,
  output_tokens integer,
  image_count integer not null default 1
);

create index if not exists captions_history_created_at_idx
  on public.captions_history (created_at desc);

alter table public.captions_history enable row level security;

drop policy if exists "anon read captions_history" on public.captions_history;
drop policy if exists "anon write captions_history" on public.captions_history;

create policy "anon read captions_history"
  on public.captions_history for select
  to anon using (true);

create policy "anon write captions_history"
  on public.captions_history for all
  to anon using (true) with check (true);
