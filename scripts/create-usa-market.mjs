#!/usr/bin/env node
/**
 * Create a "USA" Shopify Market so US customers can checkout.
 *
 * Without a Market that contains US, the country won't appear in the
 * checkout country dropdown — even if a shipping zone exists.
 *
 * Configuration (per Khadija's choice 2026-05-14):
 *   - Name: USA
 *   - Country: United States
 *   - Base currency: USD (Shopify auto-converts from primary KWD)
 *   - Enabled: true
 *   - Web presence: inherits primary domain bluemarineatelier.com (sub-path style)
 *
 * Dry-run: node scripts/create-usa-market.mjs
 * Apply:   node scripts/create-usa-market.mjs --apply
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

// Guard: don't double-create if a US market already exists
const existing = await gql(`{
  markets(first: 50) {
    edges { node {
      id name enabled
      regions(first: 50) {
        edges { node { ... on MarketRegionCountry { code } } }
      }
    }}
  }
}`);
const usMarket = existing.markets.edges.find(e =>
  e.node.regions.edges.some(r => r.node.code === "US")
);
if (usMarket) {
  console.log(`✅ US already covered by Market "${usMarket.node.name}" — nothing to do.`);
  process.exit(0);
}

console.log("Plan:");
console.log("  Market name: USA");
console.log("  Country: United States (US)");
console.log("  Base currency: USD (auto-conversion from KWD)");
console.log("  Enabled: true");
console.log("  Web presence: inherits primary domain");
console.log();

if (!APPLY) {
  console.log("ℹ️  Dry-run only. Re-run with --apply to push to Shopify.");
  process.exit(0);
}

const mutation = `
mutation Create($input: MarketCreateInput!) {
  marketCreate(input: $input) {
    market { id name enabled }
    userErrors { field message }
  }
}`;

// NOTE: Khadija's payment gateway only supports a single currency (KWD).
// Attempting baseCurrency: USD returns:
//   "The shop's payment gateway does not support enabling more than one currency."
// So we inherit the shop's primary KWD. US customers see prices in KWD.
const variables = {
  input: {
    name: "USA",
    enabled: true,
    regions: [{ countryCode: "US" }],
  },
};

const res = await gql(mutation, variables);
const errs = res.marketCreate.userErrors;
if (errs.length) {
  console.error("❌ Shopify rejected the change:");
  for (const e of errs) console.error(`  - [${e.field?.join(".")}] ${e.message}`);
  process.exit(1);
}
console.log(`✅ Market created: ${res.marketCreate.market.name} [${res.marketCreate.market.id}]`);

// Verify
console.log("Verifying…");
const verify = await gql(`{
  markets(first: 50) {
    edges { node {
      name enabled
      currencySettings { baseCurrency { currencyCode } }
      regions(first: 50) {
        edges { node { ... on MarketRegionCountry { code name } } }
      }
    }}
  }
}`);
const found = verify.markets.edges.find(e =>
  e.node.regions.edges.some(r => r.node.code === "US")
);
if (found) {
  console.log(`✅ Confirmed: "${found.node.name}" market enabled=${found.node.enabled}, currency=${found.node.currencySettings?.baseCurrency?.currencyCode}`);
} else {
  console.log("⚠️  Verification did not see US market — check Shopify admin.");
}
