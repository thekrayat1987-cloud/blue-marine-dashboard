#!/usr/bin/env node
/**
 * Audit which products have unlinked Color option values
 * (a Color option whose values are NOT linked to Shopify taxonomy color metaobjects).
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
  const j = await r.json(); if (j.errors) throw new Error(JSON.stringify(j.errors)); return j.data;
}

const all = [];
let cursor = null;
while (true) {
  const d = await gql(`query($cursor:String){
    products(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges { node {
        handle title
        options {
          name
          linkedMetafield { namespace key }
          optionValues { name linkedMetafieldValue }
        }
      } }
    }
  }`, { cursor });
  for (const e of d.products.edges) all.push(e.node);
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}

let unlinkedColor = 0, unlinkedSize = 0, linkedBoth = 0;
const issues = { unlinked_color: [], unlinked_size: [], color_with_unlinked_values: [] };

for (const p of all) {
  const colorOpt = p.options.find((o) => /color|colour|لون/i.test(o.name));
  const sizeOpt = p.options.find((o) => /^size$/i.test(o.name));
  if (colorOpt) {
    const linkedNs = colorOpt.linkedMetafield?.namespace === "shopify";
    const anyValueUnlinked = colorOpt.optionValues.some((v) => !v.linkedMetafieldValue);
    if (!linkedNs) { unlinkedColor++; issues.unlinked_color.push({ handle: p.handle, values: colorOpt.optionValues.map((v) => v.name) }); }
    else if (anyValueUnlinked) { issues.color_with_unlinked_values.push({ handle: p.handle, unlinked: colorOpt.optionValues.filter((v)=>!v.linkedMetafieldValue).map(v=>v.name) }); }
  }
  if (sizeOpt) {
    const linkedNs = sizeOpt.linkedMetafield?.namespace === "shopify";
    if (!linkedNs) { unlinkedSize++; issues.unlinked_size.push({ handle: p.handle, values: sizeOpt.optionValues.map((v) => v.name) }); }
  }
}

console.log(`Total products: ${all.length}`);
console.log(`Products with Color option not linked to taxonomy: ${unlinkedColor}`);
console.log(`Products with Size option not linked to taxonomy: ${unlinkedSize}`);
console.log(`Products with Color linked but some values unlinked: ${issues.color_with_unlinked_values.length}`);

console.log("\n--- Unlinked Color samples (first 10) ---");
for (const i of issues.unlinked_color.slice(0, 10)) console.log(`  ${i.handle.padEnd(38)} values: ${i.values.join(" | ")}`);

console.log("\n--- All distinct Color values used across unlinked products ---");
const valSet = new Set();
issues.unlinked_color.forEach((i) => i.values.forEach((v) => valSet.add(v)));
console.log([...valSet].sort().join("\n"));
