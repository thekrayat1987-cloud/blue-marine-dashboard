import { NextRequest, after } from "next/server";
import { verifyShopifyWebhook } from "@/lib/shopify-webhook";
import { standardizeFeaturedImage, TARGET_W, TARGET_H } from "@/lib/image-standardize";

export const runtime = "nodejs";
export const maxDuration = 120;

interface ShopifyProductWebhookPayload {
  id?: number;
  admin_graphql_api_id?: string;
  title?: string;
  status?: string;
  product_type?: string;
  image?: { src: string; width: number; height: number } | null;
  images?: Array<{ src: string; width: number; height: number }>;
}

function isPerfume(p: ShopifyProductWebhookPayload): boolean {
  if (/parfum|perfume|عطر/i.test(p.title || "")) return true;
  if ((p.product_type || "").toLowerCase().includes("parfum")) return true;
  return false;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-shopify-hmac-sha256");
  const topic = request.headers.get("x-shopify-topic") || "(none)";

  // Verify HMAC FIRST — reject unauthenticated requests with 401.
  if (!verifyShopifyWebhook(rawBody, signature)) {
    console.warn(`[shopify-webhook] HMAC mismatch for topic=${topic}`);
    return new Response("invalid signature", { status: 401 });
  }

  let payload: ShopifyProductWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as ShopifyProductWebhookPayload;
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const productGid =
    payload.admin_graphql_api_id ||
    (payload.id ? `gid://shopify/Product/${payload.id}` : null);
  if (!productGid) {
    return new Response("ok (no product id)", { status: 200 });
  }

  // Quick checks BEFORE returning so we can skip without scheduling background work.
  if (payload.status && payload.status !== "active") {
    return new Response("ok (not active)", { status: 200 });
  }
  if (isPerfume(payload)) {
    return new Response("ok (perfume — skipped per brand rule)", { status: 200 });
  }
  const featured = payload.image;
  if (featured && featured.width === TARGET_W && featured.height === TARGET_H) {
    // Already conformant — most webhook fires after our own standardization land here.
    return new Response("ok (already 864x1536)", { status: 200 });
  }
  if (!featured) {
    return new Response("ok (no featured image yet)", { status: 200 });
  }

  // Schedule the standardization to run AFTER the 200 response.
  // Shopify only allows 5s for the webhook to return; sharp + upload take longer.
  after(async () => {
    const cfg = {
      store: process.env.SHOPIFY_STORE_URL || "",
      token: process.env.SHOPIFY_ACCESS_TOKEN || "",
      version: process.env.SHOPIFY_API_VERSION || "2024-10",
    };
    try {
      const result = await standardizeFeaturedImage(cfg, productGid);
      console.log(
        `[shopify-webhook] ${topic} ${productGid} → ${result.status}${result.reason ? " (" + result.reason + ")" : ""}`,
      );
    } catch (e) {
      console.error(
        `[shopify-webhook] ${topic} ${productGid} ERROR — ${e instanceof Error ? e.message.slice(0, 200) : ""}`,
      );
    }
  });

  return new Response("ok (scheduled)", { status: 200 });
}
