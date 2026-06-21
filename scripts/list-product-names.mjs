#!/usr/bin/env node
/**
 * List all daraa product names (EN + AR) so we can pick an unused name for A90.
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

const all = [];
let cursor = null;
do {
  const r = await gql(
    `query($c:String){ products(first:100, after:$c, query:"status:active"){
      pageInfo{ hasNextPage endCursor }
      edges{ node{ id title productType handle } }
    } }`,
    { c: cursor },
  );
  for (const e of r.products.edges) all.push(e.node);
  cursor = r.products.pageInfo.hasNextPage ? r.products.pageInfo.endCursor : null;
} while (cursor);

// Pull AR titles in parallel batches
const arTitleByGid = {};
for (let i = 0; i < all.length; i += 10) {
  const chunk = all.slice(i, i + 10);
  await Promise.all(
    chunk.map(async (p) => {
      const tr = await gql(
        `query($id:ID!){ translatableResource(resourceId:$id){
          translations(locale:"ar"){ key value }
        } }`,
        { id: p.id },
      );
      const arT = (tr.translatableResource?.translations || []).find((x) => x.key === "title")?.value;
      arTitleByGid[p.id] = arT || "";
    }),
  );
}

// Sort by SKU number
function skuNum(t) {
  const m = t.match(/^A(\d+)/);
  return m ? Number(m[1]) : 9999;
}
all.sort((a, b) => skuNum(a.title) - skuNum(b.title));

console.log(`Total active products: ${all.length}\n`);
for (const p of all) {
  const ar = arTitleByGid[p.id] || "";
  console.log(`${p.title.padEnd(45)} | ${ar.padEnd(35)} | ${p.productType || ""}`);
}
