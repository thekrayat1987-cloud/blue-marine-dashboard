#!/usr/bin/env node
/**
 * Read-only diagnostic for Atelier Blue Marine Markets / hreflang.
 * No mutations. Pulls each Market's webPresence in detail (domain,
 * subfolder, defaultLocale, alternateLocales) and fetches the live
 * homepage HTML to inspect emitted hreflang tags.
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

async function gql(query, variables) {
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors, null, 2));
  return j.data;
}

const data = await gql(`{
  shop {
    name
    primaryDomain { url host }
    plan { displayName shopifyPlus }
  }
  shopLocales { locale primary published }
  domains: shop {
    name
  }
  markets(first: 25) {
    edges { node {
      id name handle enabled primary
      webPresence {
        id
        rootUrls { url locale }
        alternateLocales { locale primary published }
        defaultLocale { locale primary published }
        domain { id host url }
        subfolderSuffix
      }
      regions(first: 50) {
        edges { node { ... on MarketRegionCountry { code name } } }
      }
    } }
  }
}`);

console.log("=".repeat(70));
console.log(`Shop: ${data.shop.name}`);
console.log(`Primary domain: ${data.shop.primaryDomain.url}`);
console.log(`Plan: ${data.shop.plan.displayName} (Plus: ${data.shop.plan.shopifyPlus})`);
console.log("=".repeat(70));

console.log("\nShop locales:");
for (const l of data.shopLocales) {
  console.log(`  ${l.locale}${l.primary ? " *primary*" : ""}${l.published ? "" : " (UNPUBLISHED)"}`);
}

console.log("\nMarkets:");
for (const e of data.markets.edges) {
  const m = e.node;
  console.log("\n  " + "-".repeat(60));
  console.log(`  Name: ${m.name} (handle: ${m.handle})`);
  console.log(`  Enabled: ${m.enabled}  Primary: ${m.primary}`);
  console.log(`  Regions: ${m.regions.edges.map((r) => r.node.code).join(", ")}`);
  if (!m.webPresence) {
    console.log(`  webPresence: NONE`);
    continue;
  }
  const wp = m.webPresence;
  console.log(`  webPresence.id: ${wp.id}`);
  console.log(`  defaultLocale: ${wp.defaultLocale?.locale ?? "n/a"}`);
  console.log(`  alternateLocales: ${(wp.alternateLocales || []).map((l) => l.locale).join(", ") || "(none)"}`);
  console.log(`  subfolderSuffix: ${wp.subfolderSuffix ?? "(none)"}`);
  if (wp.domain) {
    console.log(`  domain.host: ${wp.domain.host}`);
    console.log(`  domain.url: ${wp.domain.url}`);
  } else {
    console.log(`  domain: (none — uses rootUrls)`);
  }
  console.log(`  rootUrls:`);
  for (const r of wp.rootUrls) console.log(`    - [${r.locale}] ${r.url}`);
}

console.log("\n" + "=".repeat(70));
console.log("Live storefront hreflang tags (homepage):");
console.log("=".repeat(70));
try {
  const html = await fetch(data.shop.primaryDomain.url, {
    headers: { "User-Agent": "Mozilla/5.0 BlueMarineDiag" },
  }).then((r) => r.text());
  const tags = html.match(/<link[^>]+hreflang[^>]+>/g) || [];
  if (tags.length === 0) {
    console.log("  (no hreflang tags found in homepage HTML)");
  } else {
    for (const t of tags) console.log("  " + t.trim());
  }
} catch (e) {
  console.log(`  Could not fetch storefront: ${e.message}`);
}
