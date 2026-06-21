#!/usr/bin/env node
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

console.log("━━━ Shop-level locales ━━━");
const shop = await gql(`{
  shopLocales { locale primary published name }
}`);
for (const l of shop.shopLocales) {
  console.log(`  ${l.primary ? "★" : " "} ${l.locale}  ${l.name}  published=${l.published}`);
}

console.log("\n━━━ Markets + web presence ━━━");
const d = await gql(`{
  markets(first: 50) {
    edges { node {
      id name enabled primary
      regions(first: 50) { edges { node { ... on MarketRegionCountry { code } } } }
      webPresence {
        domain { host }
        subfolderSuffix
        rootUrls { url locale }
        alternateLocales { locale }
        defaultLocale { locale }
      }
    }}
  }
}`);
for (const e of d.markets.edges) {
  const m = e.node;
  const countries = m.regions.edges.map(r => r.node.code).join(",");
  console.log(`\n  ${m.name}${m.primary ? " (PRIMARY)" : ""}  [${countries}]`);
  if (!m.webPresence) {
    console.log(`    ⚠️  no webPresence — inherits primary (Arabic default at bluemarineatelier.com)`);
  } else {
    const wp = m.webPresence;
    console.log(`    domain: ${wp.domain?.host || "(none)"}  subfolder: ${wp.subfolderSuffix || "(none)"}`);
    console.log(`    defaultLocale: ${wp.defaultLocale?.locale}`);
    console.log(`    alternates: ${(wp.alternateLocales || []).map(l => l.locale).join(", ") || "(none)"}`);
    for (const u of wp.rootUrls || []) console.log(`    URL: ${u.locale} → ${u.url}`);
  }
}
