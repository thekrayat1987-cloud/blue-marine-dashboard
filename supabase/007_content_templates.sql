-- Blue Marine — content templates library (winning posts saved for reuse)
-- Run this once in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/wqjrsmefeipvkorlbynz/sql/new

create table if not exists public.content_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  post_type text not null check (post_type in ('Reel','Story','Carousel','Post','Story + Post')),
  topic text not null,
  caption text not null,
  hashtags text not null default '',
  preset text not null default 'studio',
  performance_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_templates_type_idx
  on public.content_templates (post_type);

alter table public.content_templates enable row level security;

drop policy if exists "anon read content_templates" on public.content_templates;
drop policy if exists "anon write content_templates" on public.content_templates;

create policy "anon read content_templates"
  on public.content_templates for select
  to anon using (true);

create policy "anon write content_templates"
  on public.content_templates for all
  to anon using (true) with check (true);

drop trigger if exists content_templates_updated_at on public.content_templates;
create trigger content_templates_updated_at
  before update on public.content_templates
  for each row execute function public.set_updated_at();
