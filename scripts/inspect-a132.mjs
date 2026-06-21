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

// Find A132 by searching titles
const search = await gql(`{
  products(first: 5, query: "title:A132*") {
    edges { node { id handle title productType tags status } }
  }
}`);

console.log("Search results for A132:");
console.log(JSON.stringify(search.products.edges.map((e) => e.node), null, 2));

const node = search.products.edges[0]?.node;
if (!node) {
  console.error("A132 not found by title search");
  process.exit(1);
}

const d = await gql(
  `query($id:ID!){
    product(id:$id) {
      id handle title productType vendor status tags descriptionHtml
      seo { title description }
      options { name values }
      variants(first: 10) {
        edges { node { sku title selectedOptions { name value } } }
      }
      metafields(first: 50) {
        edges { node { namespace key value type } }
      }
      translations(locale: "ar") { key value }
    }
  }`,
  { id: node.id },
);

console.log("\n=== FULL A132 ===");
console.log(JSON.stringify(d.product, null, 2));
