#!/usr/bin/env node
/**
 * Inspect the catalog to design the upsell mapping:
 *  - Are there standalone Bisht products, or only Bisht Sets?
 *  - What colors exist?
 *  - What's the median price?
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

async function gql(query, variables = {}) {
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  return r.json();
}

// Group products by productType, count + price range
const out = {};
let cursor = null;
while (true) {
  const res = await gql(
    `query($cursor: String) {
      products(first: 100, after: $cursor, query: "status:active") {
        edges {
          cursor
          node {
            id
            title
            handle
            productType
            status
            priceRangeV2 { minVariantPrice { amount currencyCode } }
            tags
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    { cursor }
  );
  const edges = res.data?.products?.edges || [];
  for (const e of edges) {
    const t = e.node.productType || "(none)";
    if (!out[t]) out[t] = [];
    out[t].push({
      handle: e.node.handle,
      title: e.node.title,
      price: Number(e.node.priceRangeV2.minVariantPrice.amount),
      currency: e.node.priceRangeV2.minVariantPrice.currencyCode,
    });
  }
  if (!res.data.products.pageInfo.hasNextPage) break;
  cursor = res.data.products.pageInfo.endCursor;
}

console.log("─── Product types in catalog ───\n");
for (const [type, list] of Object.entries(out).sort((a, b) => b[1].length - a[1].length)) {
  const prices = list.map((p) => p.price).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];
  console.log(
    `${type.padEnd(25)} ${String(list.length).padStart(3)} products  min=${prices[0]}  median=${median}  max=${prices[prices.length - 1]}`
  );
}

// Sample bisht-related products
console.log("\n─── Sample 'Bisht Set' products ───");
const bishtSets = out["Bisht Set"] || [];
for (const p of bishtSets.slice(0, 5)) console.log(`  ${p.handle.padEnd(40)} ${p.price} ${p.currency}`);
console.log(`  ... (${bishtSets.length} total)`);

// Check if any product has "bisht" in the handle but a different productType (= standalone bisht)
console.log("\n─── Products with 'bisht' in handle ───");
for (const [type, list] of Object.entries(out)) {
  for (const p of list) {
    if (/bisht/i.test(p.handle) && type !== "Bisht Set") {
      console.log(`  [${type}] ${p.handle}  ${p.price}`);
    }
  }
}
