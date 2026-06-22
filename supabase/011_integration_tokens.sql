-- Encrypted OAuth/provider tokens used by server-side integration clients.
-- Values are encrypted in the app with DASHBOARD_SECRET before storage.

create table if not exists public.integration_tokens (
  provider text primary key check (provider in ('shopify', 'meta', 'snapchat')),
  access_token_ciphertext text not null,
  token_type text,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.integration_tokens enable row level security;

drop policy if exists "No anon access to integration tokens" on public.integration_tokens;
create policy "No anon access to integration tokens"
  on public.integration_tokens
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on public.integration_tokens from anon, authenticated;
grant select, insert, update, delete on public.integration_tokens to service_role;

insert into storage.buckets (id, name, public)
values ('blue-marine-generated', 'blue-marine-generated', false)
on conflict (id) do nothing;
