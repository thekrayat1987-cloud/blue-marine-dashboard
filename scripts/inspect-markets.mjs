#!/usr/bin/env node
/**
 * Inspect all Shopify Markets configured on this store.
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

const d = await gql(`{
  markets(first: 50) {
    edges { node {
      id
      name
      enabled
      primary
      regions(first: 50) {
        edges { node {
          name
          ... on MarketRegionCountry { code }
        }}
      }
      currencySettings { baseCurrency { currencyCode } }
      webPresence { rootUrls { url locale } domain { host } }
    }}
  }
}`);

for (const e of d.markets.edges) {
  const m = e.node;
  console.log(`━━━ ${m.name}${m.primary ? " (PRIMARY)" : ""}${m.enabled ? "" : " [DISABLED]"} ━━━`);
  console.log(`  Currency: ${m.currencySettings?.baseCurrency?.currencyCode || "(default)"}`);
  const countries = m.regions.edges.map(r => `${r.node.name} (${r.node.code || "?"})`);
  console.log(`  Countries: ${countries.join(", ") || "(none)"}`);
  if (m.webPresence) {
    console.log(`  Domain: ${m.webPresence.domain?.host || "(none)"}`);
    const locales = m.webPresence.rootUrls.map(u => `${u.locale} → ${u.url}`);
    console.log(`  URLs: ${locales.join(" | ")}`);
  } else {
    console.log(`  Web presence: (none — sub-path or inherits primary)`);
  }
  console.log();
}

// Check if US is covered by any market
const allCountryCodes = new Set();
for (const e of d.markets.edges) {
  for (const r of e.node.regions.edges) {
    if (r.node.code) allCountryCodes.add(r.node.code);
  }
}
console.log("━━━ Market coverage check ━━━");
console.log(`  US in a Market?  ${allCountryCodes.has("US") ? "✅ YES" : "❌ NO"}`);
console.log(`  Total markets: ${d.markets.edges.length}`);
console.log(`  All covered countries: ${[...allCountryCodes].sort().join(", ")}`);
