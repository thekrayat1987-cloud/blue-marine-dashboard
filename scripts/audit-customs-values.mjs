#!/usr/bin/env node
/**
 * Audit what country-of-origin and HS code values are currently set,
 * grouped by productType. Detect inconsistencies that we'd want to fix.
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
const byType = new Map();
let cursor = null;
while (true) {
  const d = await gql(`query($cursor:String){
    products(first:50, after:$cursor){
      pageInfo{ hasNextPage endCursor }
      edges{ node{
        title productType
        variants(first:100){ edges{ node{
          inventoryItem { countryCodeOfOrigin harmonizedSystemCode }
        }}}
      }}
    }
  }`, { cursor });
  for (const e of d.products.edges) {
    const t = e.node.productType || "(none)";
    if (!byType.has(t)) byType.set(t, { countries: new Map(), hs: new Map(), mixedProducts: new Set() });
    const b = byType.get(t);
    const productHs = new Set();
    for (const ve of e.node.variants.edges) {
      const v = ve.node.inventoryItem;
      const c = v.countryCodeOfOrigin || "(none)";
      const h = v.harmonizedSystemCode || "(none)";
      b.countries.set(c, (b.countries.get(c) || 0) + 1);
      b.hs.set(h, (b.hs.get(h) || 0) + 1);
      productHs.add(h);
    }
    if (productHs.size > 1) b.mixedProducts.add(e.node.title);
  }
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}

for (const [t, b] of byType) {
  console.log(`━━━ ${t} ━━━`);
  console.log(`  Countries: ${[...b.countries].map(([c, n]) => `${c}=${n}`).join(", ")}`);
  console.log(`  HS codes:  ${[...b.hs].map(([h, n]) => `${h}=${n}`).join(", ")}`);
  if (b.mixedProducts.size > 0) {
    console.log(`  ⚠️  ${b.mixedProducts.size} product(s) have variants with DIFFERENT HS codes:`);
    for (const p of [...b.mixedProducts].slice(0, 10)) console.log(`     - ${p}`);
  }
  console.log();
}
