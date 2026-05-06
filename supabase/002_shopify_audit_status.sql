-- Blue Marine — Shopify audit checklist persistence
-- Run this once in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/wqjrsmefeipvkorlbynz/sql/new

create table if not exists public.shopify_audit_status (
  task_key text primary key,
  done boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.shopify_audit_status enable row level security;

drop policy if exists "anon read shopify_audit_status" on public.shopify_audit_status;
drop policy if exists "anon write shopify_audit_status" on public.shopify_audit_status;

create policy "anon read shopify_audit_status"
  on public.shopify_audit_status for select
  to anon using (true);

create policy "anon write shopify_audit_status"
  on public.shopify_audit_status for all
  to anon using (true) with check (true);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists shopify_audit_status_updated_at on public.shopify_audit_status;
create trigger shopify_audit_status_updated_at
  before update on public.shopify_audit_status
  for each row execute function public.set_updated_at();
