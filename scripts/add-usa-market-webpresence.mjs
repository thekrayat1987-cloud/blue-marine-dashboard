#!/usr/bin/env node
/**
 * Add a webPresence to the USA Market so US customers see the site in English.
 *
 * Configuration (per Khadija's choice 2026-05-14):
 *   - Subfolder: /us/  (URLs: bluemarineatelier.com/us/...)
 *   - Default locale: en
 *   - Alternate locales: ar
 *   - Auto-redirect: handled by Shopify based on IP/browser detection
 *     (controlled at the storefront level, not via this API call)
 *
 * Dry-run: node scripts/add-usa-market-webpresence.mjs
 * Apply:   node scripts/add-usa-market-webpresence.mjs --apply
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
const URL_ = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${process.env.SHOPIFY_API_VERSION || "2024-10"}/graphql.json`;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const APPLY = process.argv.includes("--apply");

async function gql(q, v = {}) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query: q, variables: v }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

// Find USA market
const d = await gql(`{
  markets(first: 50) {
    edges { node {
      id name
      regions(first: 50) { edges { node { ... on MarketRegionCountry { code } } } }
      webPresence { id rootUrls { url locale } }
    }}
  }
}`);
const usa = d.markets.edges.map(e => e.node).find(m =>
  m.regions.edges.some(r => r.node.code === "US")
);
if (!usa) {
  console.error("❌ No USA market found");
  process.exit(1);
}

if (usa.webPresence) {
  console.log(`✅ USA market already has a webPresence:`);
  for (const u of usa.webPresence.rootUrls) console.log(`     ${u.locale} → ${u.url}`);
  process.exit(0);
}

console.log(`Market: ${usa.name}  [${usa.id}]`);
console.log("Plan: add webPresence");
console.log("  defaultLocale: en");
console.log("  alternateLocales: [ar]");
console.log("  subfolderSuffix: us");
console.log("  → URLs: bluemarineatelier.com/us/...");
console.log();

if (!APPLY) {
  console.log("ℹ️  Dry-run only. Re-run with --apply to push to Shopify.");
  process.exit(0);
}

const mutation = `
mutation Create($marketId: ID!, $webPresence: MarketWebPresenceCreateInput!) {
  marketWebPresenceCreate(marketId: $marketId, webPresence: $webPresence) {
    market { id name webPresence { rootUrls { url locale } } }
    userErrors { field message }
  }
}`;

const variables = {
  marketId: usa.id,
  webPresence: {
    subfolderSuffix: "us",
    defaultLocale: "en",
    alternateLocales: ["ar"],
  },
};

const res = await gql(mutation, variables);
const errs = res.marketWebPresenceCreate.userErrors;
if (errs.length) {
  console.error("❌ Shopify rejected the change:");
  for (const e of errs) console.error(`  - [${e.field?.join(".")}] ${e.message}`);
  process.exit(1);
}
console.log("✅ Web presence created. URLs:");
for (const u of res.marketWebPresenceCreate.market.webPresence.rootUrls) {
  console.log(`  ${u.locale} → ${u.url}`);
}
