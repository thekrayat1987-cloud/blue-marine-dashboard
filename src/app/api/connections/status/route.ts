import { NextResponse } from "next/server";
import { getIntegrationAccessToken } from "@/lib/integration-tokens";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CheckResult = {
  ok: boolean;
  detail?: string;
  error?: string;
};

const META_API = "https://graph.facebook.com/v21.0";

async function checkShopify(): Promise<CheckResult> {
  const shop = process.env.SHOPIFY_STORE_URL;
  const token = await getIntegrationAccessToken("shopify", "SHOPIFY_ACCESS_TOKEN");
  const version = process.env.SHOPIFY_API_VERSION || "2024-10";
  if (!shop || !token) return { ok: false, error: "Variables manquantes (SHOPIFY_STORE_URL ou SHOPIFY_ACCESS_TOKEN)" };

  try {
    const res = await fetch(`https://${shop}/admin/api/${version}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query: "{ shop { name myshopifyDomain } }" }),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const json = await res.json();
    if (json.errors) return { ok: false, error: JSON.stringify(json.errors) };
    return { ok: true, detail: json.data?.shop?.name || shop };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue" };
  }
}

async function metaGet(path: string, fields: string): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const token = await getIntegrationAccessToken("meta", "META_ACCESS_TOKEN");
  if (!token) return { ok: false, error: "META_ACCESS_TOKEN manquant" };
  try {
    const url = new URL(`${META_API}/${path}`);
    url.searchParams.set("fields", fields);
    url.searchParams.set("access_token", token);
    const res = await fetch(url.toString());
    const json = await res.json();
    if (!res.ok || json.error) {
      const msg = json.error?.message || `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    return { ok: true, data: json };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue" };
  }
}

async function checkMetaAds(): Promise<CheckResult> {
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!adAccountId) return { ok: false, error: "META_AD_ACCOUNT_ID manquant" };
  const r = await metaGet(adAccountId, "name,account_status");
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, detail: String(r.data.name || adAccountId) };
}

async function checkInstagram(): Promise<CheckResult> {
  const igId = process.env.META_INSTAGRAM_ID;
  if (!igId) return { ok: false, error: "META_INSTAGRAM_ID manquant" };
  const r = await metaGet(igId, "username,followers_count");
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, detail: `@${r.data.username} (${r.data.followers_count} followers)` };
}

async function checkWhatsApp(): Promise<CheckResult> {
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!phoneId) return { ok: false, error: "WHATSAPP_PHONE_ID manquant" };
  const r = await metaGet(phoneId, "display_phone_number,verified_name");
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, detail: `${r.data.verified_name} (${r.data.display_phone_number})` };
}

async function checkSnapchat(): Promise<CheckResult> {
  const token = await getIntegrationAccessToken("snapchat", "SNAP_ACCESS_TOKEN");
  if (!token) return { ok: false, error: "SNAP_ACCESS_TOKEN manquant" };
  try {
    const res = await fetch("https://adsapi.snapchat.com/v1/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json.debug_message || `HTTP ${res.status}` };
    const me = json.me;
    return { ok: true, detail: me?.display_name || me?.email || "OK" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue" };
  }
}

export async function GET() {
  const [shopify, meta, instagram, whatsapp, snapchat] = await Promise.all([
    checkShopify(),
    checkMetaAds(),
    checkInstagram(),
    checkWhatsApp(),
    checkSnapchat(),
  ]);

  return NextResponse.json({
    shopify,
    meta,
    instagram,
    whatsapp,
    snapchat,
    checkedAt: new Date().toISOString(),
  });
}
