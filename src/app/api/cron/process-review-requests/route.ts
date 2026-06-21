import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const TEMPLATE_AR = process.env.WHATSAPP_TEMPLATE_REVIEW_AR || "review_request_ar";
const TEMPLATE_EN = process.env.WHATSAPP_TEMPLATE_REVIEW_EN || "review_request_en";
const MAX_ATTEMPTS = 3;

interface PendingReviewRow {
  id: string;
  shopify_order_id: string;
  shopify_order_number: string | null;
  customer_first_name: string | null;
  customer_phone: string;
  customer_locale: string;
  product_id: string | null;
  review_url: string | null;
  send_at: string;
  send_attempts: number;
}

// Resolve a product handle from its numeric id (not time-critical; runs in cron).
async function resolveHandle(productId: string): Promise<string | null> {
  try {
    const store = process.env.SHOPIFY_STORE_URL;
    const ver = process.env.SHOPIFY_API_VERSION || "2024-10";
    const token = process.env.SHOPIFY_ACCESS_TOKEN;
    if (!store || !token) return null;
    const res = await fetch(
      `https://${store}/admin/api/${ver}/products/${productId}.json?fields=handle`,
      { headers: { "X-Shopify-Access-Token": token } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { product?: { handle?: string } };
    return json.product?.handle || null;
  } catch {
    return null;
  }
}

function buildReviewUrl(locale: "ar" | "en", handle: string | null): string {
  const prefix = locale === "en" ? "/en-us" : "";
  if (handle) {
    return `https://bluemarineatelier.com${prefix}/products/${handle}#judgeme_product_reviews`;
  }
  // Fallback when the product can't be resolved: send them to the catalogue.
  return `https://bluemarineatelier.com${prefix}/collections/all`;
}

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization") || "";
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const nowIso = new Date().toISOString();

  const { data: due, error: fetchErr } = await supabase.rpc(
    "claim_pending_review_requests",
    {
      batch_limit: 20,
      max_attempts: MAX_ATTEMPTS,
    },
  );

  if (fetchErr) {
    return NextResponse.json({ error: `fetch failed: ${fetchErr.message}` }, { status: 500 });
  }

  const sent: Array<{ order: string | null; wamid: string | null }> = [];
  const failed: Array<{ order: string | null; error: string; attempts: number }> = [];
  const skipped: Array<{ order: string | null; reason: string }> = [];

  for (const row of (due || []) as PendingReviewRow[]) {
    const locale = row.customer_locale === "en" ? "en" : "ar";
    const templateName = locale === "en" ? TEMPLATE_EN : TEMPLATE_AR;
    const languageCode = locale === "en" ? "en" : "ar";
    const firstName = row.customer_first_name?.trim() || (locale === "en" ? "there" : "حياك الله");

    // Resolve the per-product review link (cache it on the row once resolved).
    let reviewUrl = row.review_url;
    if (!reviewUrl) {
      const handle = row.product_id ? await resolveHandle(row.product_id) : null;
      reviewUrl = buildReviewUrl(locale, handle);
    }

    try {
      const result = await sendWhatsAppTemplate({
        to: row.customer_phone,
        templateName,
        languageCode,
        bodyParameters: [firstName, reviewUrl],
      });

      const { error: updateErr } = await supabase
        .from("pending_review_requests")
        .update({
          send_status: "sent",
          sent_at: new Date().toISOString(),
          whatsapp_message_id: result.wamid,
          review_url: reviewUrl,
          send_error: null,
        })
        .eq("id", row.id);

      if (updateErr) {
        console.error(`[review-cron] sent but failed to mark sent for ${row.id}: ${updateErr.message}`);
      }
      sent.push({ order: row.shopify_order_number, wamid: result.wamid });
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 500) : "unknown error";
      const nextAttempts = row.send_attempts;
      const nextStatus = nextAttempts >= MAX_ATTEMPTS ? "failed" : "pending";
      await supabase
        .from("pending_review_requests")
        .update({
          send_error: msg,
          send_status: nextStatus,
          review_url: reviewUrl,
        })
        .eq("id", row.id);

      if (nextStatus === "failed") {
        failed.push({ order: row.shopify_order_number, error: msg, attempts: nextAttempts });
      } else {
        skipped.push({
          order: row.shopify_order_number,
          reason: `retry ${nextAttempts}/${MAX_ATTEMPTS}: ${msg.slice(0, 120)}`,
        });
      }
    }
  }

  return NextResponse.json({
    ranAt: nowIso,
    dueCount: due?.length || 0,
    sent: sent.length,
    failed: failed.length,
    retrying: skipped.length,
    details: { sent, failed, skipped },
  });
}
