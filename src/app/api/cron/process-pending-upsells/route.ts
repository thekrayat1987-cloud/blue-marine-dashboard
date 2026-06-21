import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const TEMPLATE_AR = process.env.WHATSAPP_TEMPLATE_BISHT_UPSELL_AR || "post_purchase_bisht_upsell_ar";
const TEMPLATE_EN = process.env.WHATSAPP_TEMPLATE_BISHT_UPSELL_EN || "post_purchase_bisht_upsell_en";
const MAX_ATTEMPTS = 3;

interface PendingUpsellRow {
  id: string;
  shopify_order_id: string;
  shopify_order_number: string | null;
  customer_first_name: string | null;
  customer_phone: string;
  customer_locale: string;
  discount_url: string;
  send_at: string;
  send_attempts: number;
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

  const { data: due, error: fetchErr } = await supabase
    .from("pending_upsells")
    .select(
      "id, shopify_order_id, shopify_order_number, customer_first_name, customer_phone, customer_locale, discount_url, send_at, send_attempts",
    )
    .eq("send_status", "pending")
    .lte("send_at", nowIso)
    .lt("send_attempts", MAX_ATTEMPTS)
    .order("send_at", { ascending: true })
    .limit(20);

  if (fetchErr) {
    return NextResponse.json({ error: `fetch failed: ${fetchErr.message}` }, { status: 500 });
  }

  const sent: Array<{ order: string | null; wamid: string | null }> = [];
  const failed: Array<{ order: string | null; error: string; attempts: number }> = [];
  const skipped: Array<{ order: string | null; reason: string }> = [];

  for (const row of (due || []) as PendingUpsellRow[]) {
    const locale = row.customer_locale === "en" ? "en" : "ar";
    const templateName = locale === "en" ? TEMPLATE_EN : TEMPLATE_AR;
    const languageCode = locale === "en" ? "en" : "ar";
    const firstName = row.customer_first_name?.trim() || (locale === "en" ? "there" : "حياك الله");

    try {
      const result = await sendWhatsAppTemplate({
        to: row.customer_phone,
        templateName,
        languageCode,
        bodyParameters: [firstName, row.discount_url],
      });

      const { error: updateErr } = await supabase
        .from("pending_upsells")
        .update({
          send_status: "sent",
          sent_at: new Date().toISOString(),
          whatsapp_message_id: result.wamid,
          send_attempts: row.send_attempts + 1,
          send_error: null,
        })
        .eq("id", row.id);

      if (updateErr) {
        console.error(`[upsell-cron] sent but failed to mark sent for ${row.id}: ${updateErr.message}`);
      }
      sent.push({ order: row.shopify_order_number, wamid: result.wamid });
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 500) : "unknown error";
      const nextAttempts = row.send_attempts + 1;
      const nextStatus = nextAttempts >= MAX_ATTEMPTS ? "failed" : "pending";
      await supabase
        .from("pending_upsells")
        .update({
          send_attempts: nextAttempts,
          send_error: msg,
          send_status: nextStatus,
        })
        .eq("id", row.id);

      if (nextStatus === "failed") {
        failed.push({ order: row.shopify_order_number, error: msg, attempts: nextAttempts });
      } else {
        skipped.push({ order: row.shopify_order_number, reason: `retry ${nextAttempts}/${MAX_ATTEMPTS}: ${msg.slice(0, 120)}` });
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
