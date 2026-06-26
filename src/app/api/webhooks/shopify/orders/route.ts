import { NextRequest, after } from "next/server";
import { verifyShopifyWebhook } from "@/lib/shopify-webhook";
import { getIntegrationAccessToken } from "@/lib/integration-tokens";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 30;

interface ShopifyOrderWebhookPayload {
  id?: number;
  order_number?: number;
  name?: string;
  cancelled_at?: string | null;
  financial_status?: string | null;
  total_price?: string;
  currency?: string;
  source_name?: string | null;
  tags?: string;
  customer?: {
    id?: number;
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  billing_address?: {
    phone?: string | null;
    country_code?: string | null;
  } | null;
  shipping_address?: {
    phone?: string | null;
    country_code?: string | null;
  } | null;
  line_items?: Array<{
    product_id?: number | null;
    title?: string;
    quantity?: number;
    product_type?: string | null;
  }>;
}

function pickPhone(p: ShopifyOrderWebhookPayload): string | null {
  return (
    p.customer?.phone ||
    p.shipping_address?.phone ||
    p.billing_address?.phone ||
    null
  );
}

function pickLocale(p: ShopifyOrderWebhookPayload): "ar" | "en" {
  const country = (p.shipping_address?.country_code || p.billing_address?.country_code || "").toUpperCase();
  if (country === "US") return "en";
  return "ar";
}

function classifyOrder(p: ShopifyOrderWebhookPayload): { hasDaraa: boolean; hasBishtSet: boolean } {
  let hasDaraa = false;
  let hasBishtSet = false;
  for (const li of p.line_items || []) {
    const pt = (li.product_type || "").toLowerCase().trim();
    if (pt.includes("daraa")) hasDaraa = true;
    if (pt === "bisht set") hasBishtSet = true;
  }
  return { hasDaraa, hasBishtSet };
}

function buildDiscountUrl(locale: "ar" | "en"): string {
  const prefix = locale === "en" ? "/en-us" : "";
  return `https://bluemarineatelier.com${prefix}/discount/MATCHINGBISHT15?redirect=/collections/bisht-set`;
}

/**
 * Add the "whatsapp" tag to a manually-created (draft) order.
 * For this store, every order created in admin is a WhatsApp sale, so the
 * source_name "shopify_draft_order" is a reliable WhatsApp signal.
 */
async function tagOrderWhatsApp(orderId: string, tags: string): Promise<void> {
  const store = process.env.SHOPIFY_STORE_URL;
  const token = await getIntegrationAccessToken("shopify", "SHOPIFY_ACCESS_TOKEN");
  const version = process.env.SHOPIFY_API_VERSION || "2024-10";
  if (!store || !token) throw new Error("SHOPIFY_STORE_URL or access token missing");
  const res = await fetch(`https://${store}/admin/api/${version}/orders/${orderId}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ order: { id: Number(orderId), tags } }),
  });
  if (!res.ok) throw new Error(`Shopify ${res.status} ${(await res.text()).slice(0, 200)}`);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-shopify-hmac-sha256");
  const topic = request.headers.get("x-shopify-topic") || "(none)";

  if (!verifyShopifyWebhook(rawBody, signature)) {
    console.warn(`[orders-webhook] HMAC mismatch for topic=${topic}`);
    return new Response("invalid signature", { status: 401 });
  }

  let payload: ShopifyOrderWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as ShopifyOrderWebhookPayload;
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const orderId = payload.id ? String(payload.id) : null;
  const orderName = payload.name || (payload.order_number ? `#${payload.order_number}` : null);
  if (!orderId) {
    return new Response("ok (no order id)", { status: 200 });
  }

  if (payload.cancelled_at) {
    return new Response("ok (cancelled)", { status: 200 });
  }

  // --- Review request (independent of the upsell below): every order with a
  // phone is queued for a post-delivery WhatsApp review ask. Isolated in its
  // own background task + try/catch so it can never affect the upsell flow. ---
  {
    const reviewPhone = pickPhone(payload);
    if (reviewPhone) {
      const reviewLocale = pickLocale(payload);
      const reviewFirstName = (payload.customer?.first_name || "").trim() || null;
      const firstItem = (payload.line_items || []).find((li) => li.product_id);
      const reviewProductId = firstItem?.product_id ? String(firstItem.product_id) : null;
      const reviewProductTitle = firstItem?.title || null;
      const delayDays = Number(process.env.REVIEW_REQUEST_DELAY_DAYS || "10");
      const reviewSendAt = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000).toISOString();

      after(async () => {
        try {
          const { error } = await supabase.from("pending_review_requests").upsert(
            {
              shopify_order_id: orderId,
              shopify_order_number: orderName,
              customer_first_name: reviewFirstName,
              customer_phone: reviewPhone,
              customer_locale: reviewLocale,
              product_id: reviewProductId,
              product_title: reviewProductTitle,
              send_at: reviewSendAt,
              send_status: "pending",
            },
            { onConflict: "shopify_order_id" },
          );
          if (error) {
            console.error(`[orders-webhook] review upsert error for ${orderId}: ${error.message}`);
          } else {
            console.log(
              `[orders-webhook] queued review request for ${orderName || orderId} (locale=${reviewLocale}, send_at=${reviewSendAt})`,
            );
          }
        } catch (e) {
          console.error(
            `[orders-webhook] review background error for ${orderId}: ${e instanceof Error ? e.message.slice(0, 200) : ""}`,
          );
        }
      });
    }
  }

  // --- Auto-tag manual (draft) orders as WhatsApp. Every order created in
  // admin (source_name "shopify_draft_order") is a WhatsApp sale for this store.
  // Runs before the daraa-specific early-returns so it applies to ALL manual
  // orders, and is isolated in its own background task + try/catch so it can
  // never affect the upsell/review flows. ---
  {
    if (payload.source_name === "shopify_draft_order") {
      const existingTags = (payload.tags || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      if (!existingTags.some((t) => t.toLowerCase() === "whatsapp")) {
        const nextTags = [...existingTags, "whatsapp"].join(", ");
        after(async () => {
          try {
            await tagOrderWhatsApp(orderId, nextTags);
            console.log(
              `[orders-webhook] tagged ${orderName || orderId} 'whatsapp' (manual order)`,
            );
          } catch (e) {
            console.error(
              `[orders-webhook] whatsapp tag error for ${orderId}: ${e instanceof Error ? e.message.slice(0, 200) : ""}`,
            );
          }
        });
      }
    }
  }

  const { hasDaraa, hasBishtSet } = classifyOrder(payload);
  if (!hasDaraa) {
    return new Response("ok (no daraa)", { status: 200 });
  }
  if (hasBishtSet) {
    return new Response("ok (already has bisht set)", { status: 200 });
  }

  const phone = pickPhone(payload);
  if (!phone) {
    console.log(`[orders-webhook] ${orderName || orderId} eligible but no phone — skipping`);
    return new Response("ok (no phone)", { status: 200 });
  }

  const locale = pickLocale(payload);
  const firstName = (payload.customer?.first_name || "").trim() || null;
  const sendAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const discountUrl = buildDiscountUrl(locale);

  after(async () => {
    try {
      const { error } = await supabase
        .from("pending_upsells")
        .upsert(
          {
            shopify_order_id: orderId,
            shopify_order_number: orderName,
            customer_first_name: firstName,
            customer_phone: phone,
            customer_locale: locale,
            discount_url: discountUrl,
            send_at: sendAt,
            send_status: "pending",
          },
          { onConflict: "shopify_order_id" },
        );
      if (error) {
        console.error(`[orders-webhook] supabase upsert error for ${orderId}: ${error.message}`);
      } else {
        console.log(
          `[orders-webhook] queued upsell for ${orderName || orderId} (locale=${locale}, send_at=${sendAt})`,
        );
      }
    } catch (e) {
      console.error(
        `[orders-webhook] background error for ${orderId}: ${e instanceof Error ? e.message.slice(0, 200) : ""}`,
      );
    }
  });

  return new Response("ok (queued)", { status: 200 });
}
