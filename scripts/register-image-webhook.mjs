#!/usr/bin/env node
// Subscribe Shopify webhooks for products/create + products/update so the dashboard
// auto-standardizes featured images to 864×1536 in real time.
//
// Usage:
//   WEBHOOK_BASE=https://your-vercel-app.vercel.app node scripts/register-image-webhook.mjs
//   (or set DASHBOARD_PUBLIC_URL in .env.local)
//
// Re-running is safe: existing subscriptions for the same topic+address are detected and skipped.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envText = fs.readFileSync(path.resolve(__dirname, "..", ".env.local"), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

const BASE =
  process.env.WEBHOOK_BASE ||
  process.env.DASHBOARD_PUBLIC_URL ||
  process.env.VERCEL_PROJECT_PRODUCTION_URL ||
  "";
if (!BASE) {
  console.error(
    "❌ WEBHOOK_BASE not set. Pass it as env var, e.g.:\n   WEBHOOK_BASE=https://blue-marine-dashboard.vercel.app node scripts/register-image-webhook.mjs",
  );
  process.exit(1);
}
const ENDPOINT = `${BASE.replace(/\/+$/, "")}/api/webhooks/shopify/products`;
const TOPICS = ["PRODUCTS_CREATE", "PRODUCTS_UPDATE"];

async function gql(query, variables) {
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

console.log("Endpoint:", ENDPOINT);
console.log("Topics  :", TOPICS.join(", "));

console.log("\n1. List existing subscriptions...");
const existing = await gql(
  `{ webhookSubscriptions(first: 100) { edges { node { id topic endpoint { __typename ... on WebhookHttpEndpoint { callbackUrl } } } } } }`,
);
const rows = existing.webhookSubscriptions.edges.map((e) => e.node);
for (const r of rows) {
  const ep = r.endpoint?.__typename === "WebhookHttpEndpoint" ? r.endpoint.callbackUrl : "(non-http)";
  console.log(`  • ${r.topic.padEnd(20)} → ${ep}`);
}

for (const topic of TOPICS) {
  const dup = rows.find(
    (r) => r.topic === topic && r.endpoint?.callbackUrl === ENDPOINT,
  );
  if (dup) {
    console.log(`\n✓ ${topic} already subscribed (${dup.id})`);
    continue;
  }

  console.log(`\n→ Subscribing ${topic} ...`);
  const c = await gql(
    `mutation($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
      webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
        webhookSubscription { id topic endpoint { __typename ... on WebhookHttpEndpoint { callbackUrl } } }
        userErrors { field message }
      }
    }`,
    { topic, sub: { callbackUrl: ENDPOINT, format: "JSON" } },
  );
  if (c.webhookSubscriptionCreate.userErrors.length) {
    console.log(`   ❌ ${JSON.stringify(c.webhookSubscriptionCreate.userErrors)}`);
    continue;
  }
  const w = c.webhookSubscriptionCreate.webhookSubscription;
  console.log(`   ✅ ${w.id} (${w.topic} → ${w.endpoint.callbackUrl})`);
}

console.log("\nDone. Reminder: ensure SHOPIFY_WEBHOOK_SECRET is set in Vercel env (the");
console.log("API secret key from your Shopify custom app — Settings → Apps → your app");
console.log("→ API credentials → API secret key).");
