-- Persistent login throttling for serverless deployments.

create table if not exists public.login_rate_limits (
  key_hash text primary key,
  attempt_count integer not null default 0,
  reset_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.login_rate_limits enable row level security;

drop policy if exists "No anon access to login rate limits" on public.login_rate_limits;
create policy "No anon access to login rate limits"
  on public.login_rate_limits
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on public.login_rate_limits from anon, authenticated;
grant select, insert, update, delete on public.login_rate_limits to service_role;
