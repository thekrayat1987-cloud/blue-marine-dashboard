#!/usr/bin/env node
/**
 * Set shopify.size and shopify.sleeve-length-type on the 3-6 products missing them.
 *  - Size: full XS-3XL list (matches the standard variant set)
 *  - Sleeve length: "long" (Blue Marine standard for daraas/bishts)
 * Skip the perfume.
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

const SIZE_GIDS = [
  "gid://shopify/Metaobject/172699877676", // XS
  "gid://shopify/Metaobject/172699910444", // S
  "gid://shopify/Metaobject/172699943212", // M
  "gid://shopify/Metaobject/172699975980", // L
  "gid://shopify/Metaobject/172700008748", // XL
  "gid://shopify/Metaobject/172700041516", // 2XL
  "gid://shopify/Metaobject/172700205356", // 3XL
];
const SLEEVE_LONG_GID = "gid://shopify/Metaobject/185829523756";

// Fetch all + filter
const all = [];
let cursor = null;
while (true) {
  const d = await gql(`query($cursor:String){
    products(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges { node {
        id handle productType
        sizeMf: metafield(namespace:"shopify", key:"size") { value }
        sleeveMf: metafield(namespace:"shopify", key:"sleeve-length-type") { value }
      } }
    }
  }`, { cursor });
  for (const e of d.products.edges) all.push(e.node);
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}

const needSize = all.filter((p) => (!p.sizeMf?.value || p.sizeMf.value === "[]") && p.productType !== "Fragrance");
const needSleeve = all.filter((p) => (!p.sleeveMf?.value || p.sleeveMf.value === "[]") && p.productType !== "Fragrance");

console.log(`Products needing size metafield: ${needSize.length}`);
needSize.forEach((p) => console.log(`  - ${p.handle}`));
console.log(`Products needing sleeve-length metafield: ${needSleeve.length}`);
needSleeve.forEach((p) => console.log(`  - ${p.handle}`));

const inputs = [];
for (const p of needSize) {
  inputs.push({ ownerId: p.id, namespace: "shopify", key: "size", type: "list.metaobject_reference", value: JSON.stringify(SIZE_GIDS) });
}
for (const p of needSleeve) {
  inputs.push({ ownerId: p.id, namespace: "shopify", key: "sleeve-length-type", type: "list.metaobject_reference", value: JSON.stringify([SLEEVE_LONG_GID]) });
}

if (inputs.length === 0) {
  console.log("Nothing to fix. Done.");
  process.exit(0);
}

const MUT = `mutation($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) { metafields { id } userErrors { field message code } }
}`;
const res = await gql(MUT, { metafields: inputs });
console.log("Apply result:", JSON.stringify(res.metafieldsSet, null, 2));
writeFileSync(resolve(__dirname, "..", "fix-missing-size-sleeve.log.json"), JSON.stringify({ needSize, needSleeve, res }, null, 2));
