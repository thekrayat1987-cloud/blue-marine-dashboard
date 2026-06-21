#!/usr/bin/env node
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

const pubsData = await gql(`{ publications(first: 50) { edges { node { id name } } } }`);
const pubs = pubsData.publications.edges.map((e) => e.node);
console.log("📡 Sales channels found:");
for (const p of pubs) console.log(`   - ${p.name}  (id: ${p.id})`);

const fbPub = pubs.find((p) => /facebook|instagram|meta/i.test(p.name));
if (!fbPub) {
  console.log("\n❌ Facebook & Instagram channel NOT found in this store");
  console.log("   → That means the channel app is not installed at all");
  process.exit(0);
}
console.log(`\n✅ Using channel: ${fbPub.name}`);

const products = [];
let cursor = null;
let pageCount = 0;
while (true) {
  pageCount++;
  const data = await gql(
    `query($cursor: String, $pubId: ID!) {
      products(first: 100, after: $cursor, query: "status:active") {
        pageInfo { hasNextPage endCursor }
        edges { node {
          id
          title
          handle
          status
          totalInventory
          publishedOnPublication(publicationId: $pubId)
          featuredImage { url }
          productType
        }}
      }
    }`,
    { cursor, pubId: fbPub.id }
  );
  for (const e of data.products.edges) products.push(e.node);
  if (!data.products.pageInfo.hasNextPage) break;
  cursor = data.products.pageInfo.endCursor;
}

console.log(`\n📦 Total active products on Shopify: ${products.length}`);

const missing = products.filter((p) => !p.publishedOnPublication);
const noImage = products.filter((p) => !p.featuredImage);
const zeroStock = products.filter((p) => (p.totalInventory ?? 0) <= 0);

console.log(`\n❌ NOT published to "${fbPub.name}":  ${missing.length} products`);
console.log(`⚠️  No featured image:                  ${noImage.length} products`);
console.log(`📭 Zero/negative inventory:             ${zeroStock.length} products`);

if (missing.length) {
  console.log(`\n=== Products MISSING from Meta catalog (not on FB/IG channel) ===`);
  missing.forEach((p, i) => {
    const flags = [];
    if (!p.featuredImage) flags.push("NO-IMG");
    if ((p.totalInventory ?? 0) <= 0) flags.push("OOS");
    console.log(`${String(i + 1).padStart(3)}. ${p.title}  ${flags.length ? "[" + flags.join(",") + "]" : ""}`);
    console.log(`     handle: ${p.handle}`);
  });
}

const out = {
  channelName: fbPub.name,
  channelId: fbPub.id,
  totalActiveProducts: products.length,
  publishedToFB: products.length - missing.length,
  missingFromFB: missing.length,
  missing: missing.map((p) => ({
    id: p.id,
    title: p.title,
    handle: p.handle,
    productType: p.productType,
    inventory: p.totalInventory,
    hasImage: !!p.featuredImage,
  })),
};
const outPath = resolve(__dirname, "..", "diag-meta-catalog-missing.json");
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`\n💾 Saved → ${outPath}`);
