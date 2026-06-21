#!/usr/bin/env node
/**
 * Inspect product A129 publication status across ALL publications/channels,
 * including Shopify Catalog (Agentic).
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

console.log("━━━ All publications on this store ━━━");
const pubs = await gql(`{
  publications(first: 50) {
    edges { node { id name app { id title } } }
  }
}`);
for (const e of pubs.publications.edges) {
  console.log(`  ${e.node.name}  [${e.node.id}]`);
  if (e.node.app) console.log(`    app: ${e.node.app.title}`);
}

console.log("\n━━━ Find A129 product ID ━━━");
const search = await gql(`{
  products(first: 5, query: "title:*A129*") {
    edges { node { id title status totalInventory } }
  }
}`);
const a129 = search.products.edges.map(e => e.node).find(p => p.title.startsWith("A129"));
if (!a129) {
  console.log("❌ A129 not found via title search.");
  process.exit(1);
}
console.log(`  ${a129.title}`);
console.log(`  ${a129.id}`);
console.log(`  status: ${a129.status}, inventory: ${a129.totalInventory}`);

console.log("\n━━━ A129 publication status ━━━");
const status = await gql(`query($id: ID!) {
  product(id: $id) {
    resourcePublicationsV2(first: 50) {
      edges { node {
        isPublished
        publishDate
        publication { id name }
      }}
    }
  }
}`, { id: a129.id });
for (const e of status.product.resourcePublicationsV2.edges) {
  const n = e.node;
  console.log(`  ${n.isPublished ? "✅" : "❌"} ${n.publication.name}  ${n.publishDate || "(not scheduled)"}`);
}

console.log("\n━━━ Unpublished-on channels (where can we publish?) ━━━");
const allPubIds = pubs.publications.edges.map(e => e.node.id);
const publishedPubIds = new Set(
  status.product.resourcePublicationsV2.edges
    .filter(e => e.node.isPublished)
    .map(e => e.node.publication.id)
);
const missing = pubs.publications.edges
  .filter(e => !publishedPubIds.has(e.node.id));
if (missing.length === 0) console.log("  (none — A129 is on every channel)");
for (const e of missing) {
  console.log(`  ❌ ${e.node.name}  [${e.node.id}]`);
}
