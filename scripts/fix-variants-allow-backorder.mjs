#!/usr/bin/env node
/**
 * Flip every active variant currently in inventoryPolicy=DENY to CONTINUE
 * (back-order accepted) — except the perfume product which has finite stock.
 * This unlocks ~555 currently-unbuyable size×length combinations on the
 * made-to-order daraa/bisht catalog.
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
const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const EXCLUDED_HANDLES = new Set(["blue-marine-eau-de-parfum-50ml"]);

const products = [];
let after = null;
while (true) {
  const d = await gql(
    `query($after:String){
      products(first:25, after:$after, query:"status:active"){
        edges{ node{
          id handle title status
          variants(first:100){ edges{ node{ id inventoryPolicy } } }
        } }
        pageInfo{ hasNextPage endCursor }
      }
    }`,
    { after },
  );
  for (const e of d.products.edges) products.push(e.node);
  if (!d.products.pageInfo.hasNextPage) break;
  after = d.products.pageInfo.endCursor;
  await sleep(120);
}

console.log(`Loaded ${products.length} active products`);

const log = [];
let totalFlipped = 0;
let productsTouched = 0;

for (const p of products) {
  if (EXCLUDED_HANDLES.has(p.handle)) {
    console.log(`  skip ${p.handle} (excluded)`);
    continue;
  }
  const denyVariants = p.variants.edges
    .map((e) => e.node)
    .filter((v) => v.inventoryPolicy === "DENY");
  if (!denyVariants.length) continue;

  const variantsInput = denyVariants.map((v) => ({ id: v.id, inventoryPolicy: "CONTINUE" }));
  const d = await gql(
    `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        product { id }
        userErrors { field message }
      }
    }`,
    { productId: p.id, variants: variantsInput },
  );
  const errs = d.productVariantsBulkUpdate.userErrors;
  if (errs.length) {
    console.log(`  ❌ ${p.handle}: ${JSON.stringify(errs)}`);
    log.push({ handle: p.handle, errors: errs });
  } else {
    totalFlipped += denyVariants.length;
    productsTouched++;
    console.log(`  ✅ ${p.handle}: ${denyVariants.length} variants → CONTINUE`);
    log.push({ handle: p.handle, flipped: denyVariants.length });
  }
  await sleep(220);
}

console.log(`\n✅ Done. ${totalFlipped} variants on ${productsTouched} products switched to back-order.`);
writeFileSync(resolve(__dirname, "..", "fix-variants-allow-backorder.log.json"), JSON.stringify(log, null, 2));
