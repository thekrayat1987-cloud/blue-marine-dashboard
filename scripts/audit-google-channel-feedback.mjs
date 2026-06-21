#!/usr/bin/env node
/**
 * Inspect Google channel metafields on products (mm-google-shopping namespace
 * and google namespace) to find disapproval reasons / status.
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

// Show first product's full metafield list to discover namespaces
console.log("━━━ Step 1: discover Google-related metafield namespaces ━━━\n");

const sample = await gql(`{
  products(first: 3) {
    edges { node {
      id title
      metafields(first: 50) {
        edges { node { namespace key value } }
      }
    } }
  }
}`);

const namespaces = new Set();
for (const e of sample.products.edges) {
  console.log(`\n${e.node.title}:`);
  for (const m of e.node.metafields.edges) {
    namespaces.add(m.node.namespace);
    if (/google|shopping|gmc|merchant/i.test(m.node.namespace + m.node.key)) {
      console.log(`  ${m.node.namespace}.${m.node.key} = ${m.node.value?.slice(0, 80)}`);
    }
  }
}
console.log("\nAll namespaces seen:", [...namespaces].join(", "));

// Try also at the variant level
console.log("\n━━━ Step 2: variant-level Google metafields ━━━\n");
const variantSample = await gql(`{
  products(first: 1) {
    edges { node {
      title
      variants(first: 3) {
        edges { node {
          title sku
          metafields(first: 50) {
            edges { node { namespace key value } }
          }
        } }
      }
    } }
  }
}`);
for (const p of variantSample.products.edges) {
  for (const v of p.node.variants.edges) {
    console.log(`\n  Variant ${v.node.title} (${v.node.sku}):`);
    for (const m of v.node.metafields.edges) {
      console.log(`    ${m.node.namespace}.${m.node.key} = ${m.node.value?.slice(0, 80)}`);
    }
  }
}
