import { NextRequest, after } from "next/server";
import crypto from "node:crypto";
import { recordAdReferral, type MetaReferral } from "@/lib/whatsapp-attribution";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Inbound WhatsApp Cloud API webhook.
 *
 * GET  — Meta's subscription handshake (hub.mode / hub.verify_token / hub.challenge).
 * POST — message notifications. When a customer reaches us by clicking a
 *        Click-to-WhatsApp ad, their first message carries a `referral` object
 *        with the source ad id + ctwa_clid. We persist phone -> ad so the
 *        Shopify orders webhook can later attribute the sale to its campaign.
 *
 * Configure in Meta App Dashboard → WhatsApp → Configuration → Webhooks:
 *   Callback URL: https://<app>/api/webhooks/whatsapp
 *   Verify token: value of WHATSAPP_VERIFY_TOKEN
 *   Subscribe to the "messages" field.
 */

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token === expected) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

/** Verify Meta's X-Hub-Signature-256 (sha256=<hex> over the raw body, keyed by app secret). */
function verifyMetaSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    console.error("[whatsapp-webhook] META_APP_SECRET is not set");
    return false;
  }
  if (!signature || !signature.startsWith("sha256=")) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

interface WhatsAppWebhookBody {
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: Array<{
          from?: string;
          timestamp?: string;
          text?: { body?: string };
          referral?: MetaReferral;
        }>;
      };
    }>;
  }>;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyMetaSignature(rawBody, signature)) {
    console.warn("[whatsapp-webhook] signature mismatch");
    return new Response("invalid signature", { status: 401 });
  }

  let payload: WhatsAppWebhookBody;
  try {
    payload = JSON.parse(rawBody) as WhatsAppWebhookBody;
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  // Collect every referral-bearing message before returning 200 quickly.
  const referrals: Array<{
    waId: string;
    profileName: string | null;
    referral: MetaReferral;
    messageText: string | null;
    timestampSeconds: number | null;
    raw: unknown;
  }> = [];

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field && change.field !== "messages") continue;
      const value = change.value;
      if (!value) continue;
      const profileName = value.contacts?.[0]?.profile?.name ?? null;
      for (const msg of value.messages || []) {
        if (!msg.referral || !msg.from) continue;
        referrals.push({
          waId: msg.from,
          profileName,
          referral: msg.referral,
          messageText: msg.text?.body ?? null,
          timestampSeconds: msg.timestamp ? parseInt(msg.timestamp, 10) : null,
          raw: { referral: msg.referral, contacts: value.contacts },
        });
      }
    }
  }

  if (referrals.length) {
    after(async () => {
      for (const r of referrals) {
        try {
          await recordAdReferral(r);
          console.log(
            `[whatsapp-webhook] captured CTWA referral wa_id=${r.waId} ad_id=${r.referral.source_id ?? "?"}`,
          );
        } catch (e) {
          console.error(
            `[whatsapp-webhook] referral store error for ${r.waId}: ${e instanceof Error ? e.message.slice(0, 200) : ""}`,
          );
        }
      }
    });
  }

  return new Response("ok", { status: 200 });
}
