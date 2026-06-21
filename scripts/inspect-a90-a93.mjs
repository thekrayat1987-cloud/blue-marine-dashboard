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

for (const sku of ["A90", "A93"]) {
  const s = await gql(
    `query($q:String!){ products(first:5, query:$q){
      edges{ node{ id handle title productType status } }
    } }`,
    { q: `title:${sku}*` },
  );
  console.log(`\n━━ ${sku} ━━`);
  for (const e of s.products.edges) {
    const n = e.node;
    const tr = await gql(
      `query($id:ID!){ translatableResource(resourceId:$id){
        translations(locale:"ar"){ key value }
      } }`,
      { id: n.id },
    );
    const arTitle = (tr.translatableResource?.translations || []).find((x) => x.key === "title")?.value;
    console.log(`  handle: ${n.handle}`);
    console.log(`  EN: ${n.title}`);
    console.log(`  AR: ${arTitle || "(none)"}`);
    console.log(`  productType: ${n.productType} | status: ${n.status}`);
  }
}
