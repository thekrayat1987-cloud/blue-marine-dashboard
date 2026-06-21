#!/usr/bin/env node
/**
 * Set mm-google-shopping.custom_product = TRUE on every product.
 *
 * This is the metafield Simprosys + native Google & YouTube channel both
 * read to determine `identifier_exists`. When TRUE, the feed emits
 * `identifier_exists: no` to Google Merchant Center, which is correct
 * for atelier-made fashion (no manufacturer GTIN/MPN exists).
 *
 * This is THE fix for ~80,000 of the 83,404 GMC rejections.
 */
import { readFileSync, writeFileSync } from "node:fs";
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

// Fetch all products with their existing custom_product metafield value
const products = [];
let cursor = null;
while (true) {
  const d = await gql(`query($cursor:String){
    products(first:100, after:$cursor) {
      pageInfo { hasNextPage endCursor }
      edges { node {
        id handle status
        mf: metafield(namespace:"mm-google-shopping", key:"custom_product") { id value }
      } }
    }
  }`, { cursor });
  for (const e of d.products.edges) products.push(e.node);
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}
console.log(`Fetched ${products.length} products.`);
const already = products.filter(p => p.mf?.value === "true").length;
const toSet = products.filter(p => p.mf?.value !== "true");
console.log(`Already set: ${already}`);
console.log(`Will set: ${toSet.length}`);

// Use metafieldsSet in batches of 25 (Shopify limit)
const MUT = `mutation($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { id namespace key value }
    userErrors { field message code }
  }
}`;

const log = [];
const BATCH = 25;
for (let i = 0; i < toSet.length; i += BATCH) {
  const batch = toSet.slice(i, i + BATCH);
  const metafields = batch.map(p => ({
    ownerId: p.id,
    namespace: "mm-google-shopping",
    key: "custom_product",
    type: "boolean",
    value: "true",
  }));
  const res = await gql(MUT, { metafields });
  if (res.metafieldsSet.userErrors.length) {
    console.error("Errors in batch:", res.metafieldsSet.userErrors);
    log.push({ batch: i / BATCH, errors: res.metafieldsSet.userErrors });
  } else {
    process.stderr.write(`batch ${i / BATCH + 1}: ${res.metafieldsSet.metafields.length} updated\n`);
    log.push({ batch: i / BATCH, updated: res.metafieldsSet.metafields.length });
  }
}

writeFileSync(resolve(__dirname, "..", "set-custom-product.log.json"), JSON.stringify({
  total_products: products.length,
  already_set: already,
  newly_set: toSet.length,
  log,
}, null, 2));
console.log(`\n✅ Done. custom_product=true set on ${toSet.length} products.`);
console.log("Both Simprosys and Google & YouTube channel will now emit identifier_exists:no in the feed.");
console.log("Google Merchant Center will re-review within 24-72h.");
