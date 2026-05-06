-- Blue Marine — content publication tracking
-- Run this once in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/wqjrsmefeipvkorlbynz/sql/new

create table if not exists public.content_post_status (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  day text not null check (day in ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
  time text not null,
  status text not null default 'draft' check (status in ('draft','ready','posted')),
  posted_at timestamptz,
  custom_caption text,
  custom_hashtags text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (week_start, day, time)
);

create index if not exists content_post_status_week_idx
  on public.content_post_status (week_start);

alter table public.content_post_status enable row level security;

drop policy if exists "anon read content_post_status" on public.content_post_status;
drop policy if exists "anon write content_post_status" on public.content_post_status;

create policy "anon read content_post_status"
  on public.content_post_status for select
  to anon using (true);

create policy "anon write content_post_status"
  on public.content_post_status for all
  to anon using (true) with check (true);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists content_post_status_updated_at on public.content_post_status;
create trigger content_post_status_updated_at
  before update on public.content_post_status
  for each row execute function public.set_updated_at();
