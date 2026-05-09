#!/usr/bin/env node
/**
 * Set inventory to 5 units on every Black variant of A91 – Mayasa Daraa.
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
const TARGET_QTY = 5;
const SKU_PREFIX = "A91";

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

// 1. Find the A91 product
const search = await gql(
  `query($q: String!) {
    products(first: 5, query: $q) {
      edges { node { id title } }
    }
  }`,
  { q: `sku:${SKU_PREFIX}-*` }
);
let product = search.products.edges
  .map((e) => e.node)
  .find((p) => /^A91\b/i.test(p.title));
if (!product) {
  const byTitle = await gql(
    `query { products(first: 5, query: "title:A91*") { edges { node { id title } } } }`
  );
  product = byTitle.products.edges
    .map((e) => e.node)
    .find((p) => /^A91\b/i.test(p.title));
}
if (!product) throw new Error("A91 product not found");
console.log(`Product: ${product.title} (${product.id})`);

// 2. Get the primary location
const locData = await gql(`{ locations(first: 5) { edges { node { id name } } } }`);
const location = locData.locations.edges[0]?.node;
if (!location) throw new Error("No location found");
console.log(`Location: ${location.name} (${location.id})`);

// 3. Page through all variants, keep Black ones
const variants = [];
let cursor = null;
while (true) {
  const data = await gql(
    `query($id: ID!, $after: String) {
      product(id: $id) {
        variants(first: 100, after: $after) {
          pageInfo { hasNextPage endCursor }
          edges { node {
            id
            title
            sku
            selectedOptions { name value }
            inventoryItem { id }
          } }
        }
      }
    }`,
    { id: product.id, after: cursor }
  );
  const page = data.product.variants;
  for (const e of page.edges) variants.push(e.node);
  if (!page.pageInfo.hasNextPage) break;
  cursor = page.pageInfo.endCursor;
}
console.log(`Total variants: ${variants.length}`);

const blackVariants = variants.filter((v) =>
  v.selectedOptions.some(
    (o) => o.name.toLowerCase() === "color" && /black/i.test(o.value)
  )
);
console.log(`Black variants: ${blackVariants.length}`);
if (blackVariants.length === 0) throw new Error("No Black variants found");

// 4. Set on-hand quantity to 5 for each Black variant (batched 100/call)
const BATCH = 100;
let updated = 0;
for (let i = 0; i < blackVariants.length; i += BATCH) {
  const slice = blackVariants.slice(i, i + BATCH);
  const result = await gql(
    `mutation($input: InventorySetQuantitiesInput!) {
      inventorySetQuantities(input: $input) {
        userErrors { field message }
      }
    }`,
    {
      input: {
        name: "available",
        reason: "correction",
        ignoreCompareQuantity: true,
        quantities: slice.map((v) => ({
          inventoryItemId: v.inventoryItem.id,
          locationId: location.id,
          quantity: TARGET_QTY,
        })),
      },
    }
  );
  const errs = result.inventorySetQuantities.userErrors;
  if (errs.length) {
    console.error("userErrors:", JSON.stringify(errs, null, 2));
    throw new Error("Inventory update failed");
  }
  updated += slice.length;
  console.log(`  set ${updated}/${blackVariants.length}`);
  await sleep(300);
}

console.log(`\nDone — ${blackVariants.length} Black variants set to ${TARGET_QTY} units each (total ${blackVariants.length * TARGET_QTY}).`);
