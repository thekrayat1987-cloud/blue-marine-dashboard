import { NextRequest, after } from "next/server";
import { verifyShopifyWebhook } from "@/lib/shopify-webhook";
import { standardizeCollectionImage, TARGET_W, TARGET_H } from "@/lib/image-standardize";

export const runtime = "nodejs";
export const maxDuration = 120;

interface ShopifyCollectionWebhookPayload {
  id?: number;
  admin_graphql_api_id?: string;
  title?: string;
  image?: { src: string; width: number; height: number } | null;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-shopify-hmac-sha256");
  const topic = request.headers.get("x-shopify-topic") || "(none)";

  if (!verifyShopifyWebhook(rawBody, signature)) {
    console.warn(`[shopify-webhook] HMAC mismatch for topic=${topic}`);
    return new Response("invalid signature", { status: 401 });
  }

  let payload: ShopifyCollectionWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as ShopifyCollectionWebhookPayload;
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const collectionGid =
    payload.admin_graphql_api_id ||
    (payload.id ? `gid://shopify/Collection/${payload.id}` : null);
  if (!collectionGid) {
    return new Response("ok (no collection id)", { status: 200 });
  }

  const img = payload.image;
  if (!img) {
    return new Response("ok (no cover image yet)", { status: 200 });
  }
  if (img.width === TARGET_W && img.height === TARGET_H) {
    return new Response("ok (already 864x1536)", { status: 200 });
  }

  after(async () => {
    const cfg = {
      store: process.env.SHOPIFY_STORE_URL || "",
      token: process.env.SHOPIFY_ACCESS_TOKEN || "",
      version: process.env.SHOPIFY_API_VERSION || "2024-10",
    };
    try {
      const result = await standardizeCollectionImage(cfg, collectionGid);
      console.log(
        `[shopify-webhook] ${topic} ${collectionGid} → ${result.status}${result.reason ? " (" + result.reason + ")" : ""}`,
      );
    } catch (e) {
      console.error(
        `[shopify-webhook] ${topic} ${collectionGid} ERROR — ${e instanceof Error ? e.message.slice(0, 200) : ""}`,
      );
    }
  });

  return new Response("ok (scheduled)", { status: 200 });
}
