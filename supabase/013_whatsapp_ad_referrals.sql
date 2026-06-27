-- Blue Marine — Click-to-WhatsApp (CTWA) ad attribution bridge
--
-- whatsapp_ad_referrals:  the inbound WhatsApp webhook (/api/webhooks/whatsapp)
--   inserts one row whenever a customer's message carries a Meta `referral`
--   object (i.e. they reached us by clicking a Click-to-WhatsApp ad). This maps
--   the customer phone -> the ad / adset / campaign that drove them.
--
-- whatsapp_order_attribution: the Shopify orders webhook
--   (/api/webhooks/shopify/orders) writes one row per order it can match to a
--   referral by phone, so the dashboard can report revenue per campaign for the
--   WhatsApp channel that the Meta pixel never sees.
--
-- Server code uses the service-role key, which bypasses RLS. RLS is enabled with
-- NO anon policies (matches 010_security_hardening). Run once via Supabase MCP
-- apply_migration or the SQL Editor. Idempotent.

create table if not exists public.whatsapp_ad_referrals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  captured_at timestamptz not null default now(), -- WhatsApp message timestamp
  phone text not null,                            -- normalized digits, full intl (e.g. 96590000000)
  phone_national text,                            -- last 8 digits, format-tolerant match
  wa_id text,
  profile_name text,
  ad_id text,
  ad_name text,
  adset_id text,
  adset_name text,
  campaign_id text,
  campaign_name text,
  ctwa_clid text,                                 -- Click-to-WhatsApp click id (unique per click)
  source_url text,
  source_type text,                               -- "ad" | "post"
  headline text,
  body text,
  message_text text,
  raw jsonb
);

-- Dedupe webhook retries on the click id when present.
create unique index if not exists whatsapp_ad_referrals_clid_unique
  on public.whatsapp_ad_referrals (ctwa_clid)
  where ctwa_clid is not null;

create index if not exists whatsapp_ad_referrals_phone_idx
  on public.whatsapp_ad_referrals (phone, created_at desc);

create index if not exists whatsapp_ad_referrals_national_idx
  on public.whatsapp_ad_referrals (phone_national, created_at desc);

alter table public.whatsapp_ad_referrals enable row level security;

create table if not exists public.whatsapp_order_attribution (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  shopify_order_id text not null,
  shopify_order_number text,
  phone text,
  referral_id uuid references public.whatsapp_ad_referrals(id) on delete set null,
  ad_id text,
  ad_name text,
  campaign_id text,
  campaign_name text,
  ctwa_clid text,
  referral_captured_at timestamptz,
  order_amount numeric,
  currency text default 'KWD',
  matched_by text                                 -- 'phone' | 'national'
);

create unique index if not exists whatsapp_order_attribution_order_unique
  on public.whatsapp_order_attribution (shopify_order_id);

create index if not exists whatsapp_order_attribution_campaign_idx
  on public.whatsapp_order_attribution (campaign_id, created_at desc);

alter table public.whatsapp_order_attribution enable row level security;
