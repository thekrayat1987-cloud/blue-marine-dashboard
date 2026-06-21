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
const types = new Map();
let cursor = null;
let total = 0, varsTotal = 0, varsNoOrigin = 0, varsNoHs = 0;
while (true) {
  const d = await gql(`query($cursor:String){
    products(first:50, after:$cursor){
      pageInfo{ hasNextPage endCursor }
      edges{ node{
        id title productType
        variants(first:100){ edges{ node{
          id
          inventoryItem { countryCodeOfOrigin harmonizedSystemCode }
        }}}
      }}
    }
  }`, { cursor });
  for (const e of d.products.edges) {
    const p = e.node;
    total++;
    const t = p.productType || "(none)";
    if (!types.has(t)) types.set(t, { products: 0, variants: 0, noOrigin: 0, noHs: 0, sampleHs: new Set() });
    const bucket = types.get(t);
    bucket.products++;
    for (const ve of p.variants.edges) {
      const v = ve.node;
      varsTotal++;
      bucket.variants++;
      if (!v.inventoryItem.countryCodeOfOrigin) { varsNoOrigin++; bucket.noOrigin++; }
      else if (v.inventoryItem.countryCodeOfOrigin !== "KW") bucket.sampleHs.add(`origin=${v.inventoryItem.countryCodeOfOrigin}`);
      if (!v.inventoryItem.harmonizedSystemCode) { varsNoHs++; bucket.noHs++; }
      else if (v.inventoryItem.harmonizedSystemCode) bucket.sampleHs.add(v.inventoryItem.harmonizedSystemCode);
    }
  }
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}
console.log(`Total products: ${total}`);
console.log(`Total variants: ${varsTotal}`);
console.log(`Variants missing country: ${varsNoOrigin}`);
console.log(`Variants missing HS code:  ${varsNoHs}`);
console.log();
console.log("By productType:");
const rows = [...types.entries()].sort((a, b) => b[1].variants - a[1].variants);
for (const [t, b] of rows) {
  const samples = [...b.sampleHs].slice(0, 5).join(",");
  console.log(`  ${t.padEnd(22)} prod=${String(b.products).padStart(3)} var=${String(b.variants).padStart(5)} noOrigin=${String(b.noOrigin).padStart(5)} noHS=${String(b.noHs).padStart(5)} existingHS=[${samples}]`);
}
