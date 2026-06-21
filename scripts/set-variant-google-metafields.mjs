#!/usr/bin/env node
/**
 * Set per-variant mm-google-shopping.{color,size,age_group,gender} metafields
 * on every variant in the catalog. The Shopify bulk editor flags these as
 * "Missing" at the variant level even though product-level fields are set;
 * setting them per-variant suppresses the warnings and gives Google an
 * explicit feed value for every variant.
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
  const r = await fetch(URL_, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN }, body: JSON.stringify({ query: q, variables: v }) });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

// Walk every product, get every variant with its option values + existing google metafields
const products = [];
let cursor = null;
while (true) {
  const d = await gql(`query($cursor:String){
    products(first: 25, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges { node {
        id handle productType status
      } }
    }
  }`, { cursor });
  for (const e of d.products.edges) products.push(e.node);
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}
console.log(`Products: ${products.length}`);

// Fetch variants per product (variants can exceed page limits, so per-product paging)
async function fetchVariants(productId) {
  const out = [];
  let vCursor = null;
  while (true) {
    const d = await gql(`query($id:ID!, $cursor:String){
      product(id:$id) {
        variants(first: 250, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          edges { node {
            id title
            selectedOptions { name value }
            color: metafield(namespace:"mm-google-shopping", key:"color") { value }
            size: metafield(namespace:"mm-google-shopping", key:"size") { value }
            ag: metafield(namespace:"mm-google-shopping", key:"age_group") { value }
            gen: metafield(namespace:"mm-google-shopping", key:"gender") { value }
          } }
        }
      }
    }`, { id: productId, cursor: vCursor });
    for (const e of d.product.variants.edges) out.push(e.node);
    if (!d.product.variants.pageInfo.hasNextPage) break;
    vCursor = d.product.variants.pageInfo.endCursor;
  }
  return out;
}

const MUT = `mutation($metafields:[MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { id }
    userErrors { field message code }
  }
}`;

let totalVariants = 0;
let totalSet = 0;
let totalSkipped = 0;
const batch = [];

async function flushBatch() {
  while (batch.length > 0) {
    const payload = batch.splice(0, 25);
    const res = await gql(MUT, { metafields: payload });
    if (res.metafieldsSet.userErrors?.length) {
      console.error("Errors:", res.metafieldsSet.userErrors.slice(0, 3));
    }
    totalSet += res.metafieldsSet.metafields?.length || 0;
  }
}

for (const p of products) {
  const variants = await fetchVariants(p.id);
  totalVariants += variants.length;
  for (const v of variants) {
    const color = v.selectedOptions.find((o) => /color|colour|لون/i.test(o.name))?.value;
    const size = v.selectedOptions.find((o) => /^size$/i.test(o.name))?.value;
    const inputs = [];
    if (color && v.color?.value !== color) {
      inputs.push({ ownerId: v.id, namespace: "mm-google-shopping", key: "color", type: "single_line_text_field", value: color });
    }
    if (size && v.size?.value !== size) {
      inputs.push({ ownerId: v.id, namespace: "mm-google-shopping", key: "size", type: "single_line_text_field", value: size });
    }
    if (v.ag?.value !== "adult") {
      inputs.push({ ownerId: v.id, namespace: "mm-google-shopping", key: "age_group", type: "single_line_text_field", value: "adult" });
    }
    if (v.gen?.value !== "female") {
      inputs.push({ ownerId: v.id, namespace: "mm-google-shopping", key: "gender", type: "single_line_text_field", value: "female" });
    }
    if (inputs.length === 0) { totalSkipped++; continue; }
    batch.push(...inputs);
    if (batch.length >= 25) await flushBatch();   // strict: drain in 25-chunks
  }
  process.stderr.write(`✓ ${p.handle.padEnd(40)} variants=${variants.length}\n`);
}
await flushBatch();

const summary = { totalProducts: products.length, totalVariants, totalMetafieldsSet: totalSet, variantsFullyAlreadySet: totalSkipped };
writeFileSync(resolve(__dirname, "..", "set-variant-google-metafields.log.json"), JSON.stringify(summary, null, 2));
console.log("\nDone:", summary);
