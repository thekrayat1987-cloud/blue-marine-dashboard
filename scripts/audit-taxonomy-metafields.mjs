#!/usr/bin/env node
/**
 * Audit which products are missing the Shopify Taxonomy metafields
 * that the apparel category requires:
 *   shopify.age-group       (metaobject_reference list)
 *   shopify.target-gender   (metaobject_reference list)
 *   shopify.size            (metaobject_reference list)
 *   shopify.color-pattern   (metaobject_reference list)
 *   shopify.sleeve-length-type (metaobject_reference list)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envText = readFileSync(resolve("/Users/thekrayathusain/Blue marine/dashboard/.env.local"), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const URL_ = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${process.env.SHOPIFY_API_VERSION || "2024-10"}/graphql.json`;
async function gql(q, v = {}) {
  const r = await fetch(URL_, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN }, body: JSON.stringify({ query: q, variables: v }) });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const all = [];
let cursor = null;
while (true) {
  const d = await gql(`query($cursor:String){
    products(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges { node {
        id handle title status productType
        ageGroup: metafield(namespace:"shopify", key:"age-group") { value }
        gender: metafield(namespace:"shopify", key:"target-gender") { value }
        size: metafield(namespace:"shopify", key:"size") { value }
        color: metafield(namespace:"shopify", key:"color-pattern") { value }
        sleeve: metafield(namespace:"shopify", key:"sleeve-length-type") { value }
      } }
    }
  }`, { cursor });
  for (const e of d.products.edges) all.push(e.node);
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}

const stats = {
  total: all.length,
  missing_ageGroup: 0,
  missing_gender: 0,
  missing_size: 0,
  missing_color: 0,
  missing_sleeve: 0,
  perfectly_filled: 0,
};
const samples = { missing_ageGroup: [], missing_gender: [], missing_size: [], missing_color: [], missing_sleeve: [] };

for (const p of all) {
  let allOk = true;
  if (!p.ageGroup?.value || p.ageGroup.value === "[]") { stats.missing_ageGroup++; samples.missing_ageGroup.push(p.handle); allOk = false; }
  if (!p.gender?.value || p.gender.value === "[]") { stats.missing_gender++; samples.missing_gender.push(p.handle); allOk = false; }
  if (!p.size?.value || p.size.value === "[]") { stats.missing_size++; samples.missing_size.push(p.handle); allOk = false; }
  if (!p.color?.value || p.color.value === "[]") { stats.missing_color++; samples.missing_color.push(p.handle); allOk = false; }
  if (!p.sleeve?.value || p.sleeve.value === "[]") { stats.missing_sleeve++; samples.missing_sleeve.push(p.handle); allOk = false; }
  if (allOk) stats.perfectly_filled++;
}

console.log("=== Shopify Taxonomy metafields audit ===");
console.log(`Total products: ${stats.total}`);
console.log(`Perfectly filled: ${stats.perfectly_filled}`);
console.log(`Missing age-group: ${stats.missing_ageGroup}`);
console.log(`Missing target-gender: ${stats.missing_gender}`);
console.log(`Missing size: ${stats.missing_size}`);
console.log(`Missing color-pattern: ${stats.missing_color}`);
console.log(`Missing sleeve-length-type: ${stats.missing_sleeve}`);
console.log("\nSamples (first 5 of each missing category):");
for (const [k, v] of Object.entries(samples)) console.log(`  ${k}: ${v.slice(0,5).join(", ")}${v.length>5?` ... and ${v.length-5} more`:""}`);
