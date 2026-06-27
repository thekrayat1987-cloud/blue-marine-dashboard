import { supabase } from "@/lib/supabase";
import { getIntegrationAccessToken } from "@/lib/integration-tokens";
import { normalizePhone, nationalPhone } from "@/lib/phone";

const META_API_VERSION = "v21.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

// Default attribution window: a CTWA click usually converts within days, but
// daraa/bisht buyers often chat over several days before paying. 30 days is the
// same window Meta uses for click attribution.
export const REFERRAL_MATCH_WINDOW_DAYS = 30;

/** The Meta `referral` object attached to the first message after a CTWA click. */
export interface MetaReferral {
  source_url?: string;
  source_id?: string; // the ad id
  source_type?: string; // "ad" | "post"
  headline?: string;
  body?: string;
  ctwa_clid?: string;
}

interface ResolvedAd {
  adId: string;
  adName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  campaignId: string | null;
  campaignName: string | null;
}

// Ad metadata is immutable enough to cache for the lifetime of the lambda.
const adCache = new Map<string, ResolvedAd>();

/** Resolve an ad id to its adset + campaign names via the Graph API. */
export async function resolveAdToCampaign(adId: string): Promise<ResolvedAd> {
  const cached = adCache.get(adId);
  if (cached) return cached;

  const fallback: ResolvedAd = {
    adId,
    adName: null,
    adsetId: null,
    adsetName: null,
    campaignId: null,
    campaignName: null,
  };

  try {
    const token = await getIntegrationAccessToken("meta", "META_ACCESS_TOKEN");
    if (!token) return fallback;
    const url = new URL(`${META_BASE_URL}/${adId}`);
    url.searchParams.set("access_token", token);
    url.searchParams.set("fields", "name,adset{id,name},campaign{id,name}");
    const res = await fetch(url.toString());
    if (!res.ok) return fallback;
    const d = (await res.json()) as {
      name?: string;
      adset?: { id?: string; name?: string };
      campaign?: { id?: string; name?: string };
    };
    const resolved: ResolvedAd = {
      adId,
      adName: d.name ?? null,
      adsetId: d.adset?.id ?? null,
      adsetName: d.adset?.name ?? null,
      campaignId: d.campaign?.id ?? null,
      campaignName: d.campaign?.name ?? null,
    };
    adCache.set(adId, resolved);
    return resolved;
  } catch {
    return fallback;
  }
}

/**
 * Persist a CTWA referral captured from an inbound WhatsApp message. Resolves
 * the ad to its campaign so order matching can tag with a human-readable name.
 * Idempotent on ctwa_clid (webhook retries upsert the same row).
 */
export async function recordAdReferral(args: {
  waId: string;
  profileName?: string | null;
  referral: MetaReferral;
  messageText?: string | null;
  timestampSeconds?: number | null;
  raw?: unknown;
}): Promise<void> {
  const phone = normalizePhone(args.waId);
  if (!phone) return;

  const adId = args.referral.source_id || null;
  const resolved = adId ? await resolveAdToCampaign(adId) : null;

  const capturedAt = args.timestampSeconds
    ? new Date(args.timestampSeconds * 1000).toISOString()
    : new Date().toISOString();

  const row = {
    captured_at: capturedAt,
    phone,
    phone_national: nationalPhone(args.waId),
    wa_id: args.waId,
    profile_name: args.profileName ?? null,
    ad_id: adId,
    ad_name: resolved?.adName ?? null,
    adset_id: resolved?.adsetId ?? null,
    adset_name: resolved?.adsetName ?? null,
    campaign_id: resolved?.campaignId ?? null,
    campaign_name: resolved?.campaignName ?? null,
    ctwa_clid: args.referral.ctwa_clid ?? null,
    source_url: args.referral.source_url ?? null,
    source_type: args.referral.source_type ?? null,
    headline: args.referral.headline ?? null,
    body: args.referral.body ?? null,
    message_text: args.messageText ?? null,
    raw: args.raw ?? null,
  };

  if (row.ctwa_clid) {
    const { error } = await supabase
      .from("whatsapp_ad_referrals")
      .upsert(row, { onConflict: "ctwa_clid" });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("whatsapp_ad_referrals").insert(row);
    if (error) throw new Error(error.message);
  }
}

export interface MatchedReferral {
  id: string;
  adId: string | null;
  adName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  ctwaClid: string | null;
  capturedAt: string;
  matchedBy: "phone" | "national";
}

/**
 * Find the most recent CTWA referral for a customer phone, within the
 * attribution window. Tries the full normalized number first, then the
 * 8-digit national fallback for cross-format robustness.
 */
export async function findReferralForPhone(
  rawPhone: string | null | undefined,
  withinDays = REFERRAL_MATCH_WINDOW_DAYS,
): Promise<MatchedReferral | null> {
  const phone = normalizePhone(rawPhone);
  const national = nationalPhone(rawPhone);
  if (!phone && !national) return null;

  const sinceISO = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000).toISOString();

  const map = (
    r: Record<string, unknown>,
    matchedBy: "phone" | "national",
  ): MatchedReferral => ({
    id: String(r.id),
    adId: (r.ad_id as string) ?? null,
    adName: (r.ad_name as string) ?? null,
    campaignId: (r.campaign_id as string) ?? null,
    campaignName: (r.campaign_name as string) ?? null,
    ctwaClid: (r.ctwa_clid as string) ?? null,
    capturedAt: String(r.captured_at),
    matchedBy,
  });

  if (phone) {
    const { data } = await supabase
      .from("whatsapp_ad_referrals")
      .select("*")
      .eq("phone", phone)
      .gte("captured_at", sinceISO)
      .order("captured_at", { ascending: false })
      .limit(1);
    if (data && data.length) return map(data[0], "phone");
  }

  if (national) {
    const { data } = await supabase
      .from("whatsapp_ad_referrals")
      .select("*")
      .eq("phone_national", national)
      .gte("captured_at", sinceISO)
      .order("captured_at", { ascending: false })
      .limit(1);
    if (data && data.length) return map(data[0], "national");
  }

  return null;
}

/** Record (or refresh) the campaign attribution for a matched order. */
export async function recordOrderAttribution(args: {
  shopifyOrderId: string;
  shopifyOrderNumber?: string | null;
  phone: string | null;
  referral: MatchedReferral;
  amount?: number | null;
  currency?: string | null;
}): Promise<void> {
  const { error } = await supabase.from("whatsapp_order_attribution").upsert(
    {
      shopify_order_id: args.shopifyOrderId,
      shopify_order_number: args.shopifyOrderNumber ?? null,
      phone: args.phone,
      referral_id: args.referral.id,
      ad_id: args.referral.adId,
      ad_name: args.referral.adName,
      campaign_id: args.referral.campaignId,
      campaign_name: args.referral.campaignName,
      ctwa_clid: args.referral.ctwaClid,
      referral_captured_at: args.referral.capturedAt,
      order_amount: args.amount ?? null,
      currency: args.currency ?? "KWD",
      matched_by: args.referral.matchedBy,
    },
    { onConflict: "shopify_order_id" },
  );
  if (error) throw new Error(error.message);
}

export interface CtwaCampaignRollup {
  campaignId: string | null;
  campaignName: string;
  orders: number;
  revenue: number;
}

/** Campaign-level rollup of CTWA-attributed orders for the dashboard. */
export async function getCtwaAttributionRollup(
  withinDays = 90,
): Promise<{ currency: string; totalOrders: number; totalRevenue: number; campaigns: CtwaCampaignRollup[] }> {
  const sinceISO = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("whatsapp_order_attribution")
    .select("campaign_id, campaign_name, order_amount, currency")
    .gte("created_at", sinceISO);
  if (error) throw new Error(error.message);

  const rows = (data || []) as Array<{
    campaign_id: string | null;
    campaign_name: string | null;
    order_amount: number | null;
    currency: string | null;
  }>;

  let currency = "KWD";
  let totalRevenue = 0;
  const map = new Map<string, CtwaCampaignRollup>();
  for (const r of rows) {
    if (r.currency) currency = r.currency;
    const amount = r.order_amount ?? 0;
    totalRevenue += amount;
    const key = r.campaign_id || r.campaign_name || "(unknown)";
    const existing = map.get(key);
    if (existing) {
      existing.orders += 1;
      existing.revenue += amount;
    } else {
      map.set(key, {
        campaignId: r.campaign_id,
        campaignName: r.campaign_name || "(unknown campaign)",
        orders: 1,
        revenue: amount,
      });
    }
  }

  return {
    currency,
    totalOrders: rows.length,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    campaigns: Array.from(map.values())
      .map((c) => ({ ...c, revenue: Math.round(c.revenue * 100) / 100 }))
      .sort((a, b) => b.revenue - a.revenue),
  };
}
