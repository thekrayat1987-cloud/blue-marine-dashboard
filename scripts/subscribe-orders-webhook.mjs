#!/usr/bin/env node
/**
 * Subscribe the production dashboard to Shopify's orders/create webhook.
 * Idempotent: if a subscription already points to our URL+topic, it's reused.
 *
 * Required env:
 *   - SHOPIFY_STORE_URL, SHOPIFY_ACCESS_TOKEN, SHOPIFY_API_VERSION
 *   - WEBHOOK_BASE_URL (e.g. https://dashboard.bluemarineatelier.com)
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

const BASE = (process.env.WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "")
  .replace(/\/$/, "");
if (!BASE) {
  console.error("❌ Set WEBHOOK_BASE_URL (or NEXT_PUBLIC_APP_URL) in .env.local — the public URL of the Vercel dashboard");
  process.exit(1);
}
const CALLBACK = `${BASE}/api/webhooks/shopify/orders`;
const TOPIC = "ORDERS_CREATE";

async function gql(query, variables = {}) {
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

// 1) Already subscribed?
const existing = await gql(
  `query { webhookSubscriptions(first: 100, topics: [ORDERS_CREATE]) {
    edges { node { id topic endpoint { __typename ... on WebhookHttpEndpoint { callbackUrl } } } }
  } }`,
);
const match = existing.webhookSubscriptions.edges.find(
  (e) => e.node.endpoint?.callbackUrl === CALLBACK,
);
if (match) {
  console.log(`ℹ️  Already subscribed: ${match.node.id} → ${CALLBACK}`);
  process.exit(0);
}

// 2) Create subscription
const createRes = await gql(
  `mutation($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
      webhookSubscription { id topic endpoint { ... on WebhookHttpEndpoint { callbackUrl } } }
      userErrors { field message }
    }
  }`,
  {
    topic: TOPIC,
    sub: {
      callbackUrl: CALLBACK,
      format: "JSON",
      includeFields: [
        "id",
        "order_number",
        "name",
        "cancelled_at",
        "financial_status",
        "total_price",
        "currency",
        "customer",
        "billing_address",
        "shipping_address",
        "line_items",
      ],
    },
  },
);

const errs = createRes.webhookSubscriptionCreate.userErrors;
if (errs.length) {
  console.error("❌ webhookSubscriptionCreate errors:");
  for (const e of errs) console.error(`   - ${e.field?.join(".")}: ${e.message}`);
  process.exit(1);
}

const sub = createRes.webhookSubscriptionCreate.webhookSubscription;
console.log(`✅ Subscribed ${sub.topic} → ${sub.endpoint.callbackUrl}`);
console.log(`   id: ${sub.id}`);
