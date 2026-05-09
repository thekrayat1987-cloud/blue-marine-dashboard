import crypto from "node:crypto";

/**
 * Verify a Shopify webhook signature.
 *
 * Shopify signs every webhook with HMAC-SHA256 using the app's API secret key
 * and includes the base64 digest in the X-Shopify-Hmac-Sha256 header.
 * We re-compute the digest over the raw request body and compare in constant time.
 */
export function verifyShopifyWebhook(rawBody: string, signature: string | null): boolean {
  // The Shopify custom app's API secret is the same value used for OAuth client_secret
  // AND for webhook HMAC signing. Prefer the dedicated SHOPIFY_WEBHOOK_SECRET if set,
  // otherwise fall back to SHOPIFY_CLIENT_SECRET so we don't duplicate secrets in Vercel.
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) {
    console.error(
      "[shopify-webhook] SHOPIFY_WEBHOOK_SECRET / SHOPIFY_CLIENT_SECRET is not set",
    );
    return false;
  }
  if (!signature) return false;

  const computed = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");

  const a = Buffer.from(computed);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
