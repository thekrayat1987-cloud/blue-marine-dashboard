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

let cursor = null;
const all = [];
while (true) {
  const d = await gql(
    `query($c:String){
      metaobjects(type:"shopify--color-pattern", first:100, after:$c){
        pageInfo{hasNextPage endCursor}
        edges{ node { id handle displayName } }
      }
    }`,
    { c: cursor },
  );
  for (const e of d.metaobjects.edges) all.push(e.node);
  if (!d.metaobjects.pageInfo.hasNextPage) break;
  cursor = d.metaobjects.pageInfo.endCursor;
}

const SOLID = new Set([
  "black","black-1","white","red","blue","navy","green","dark-green","emerald-green",
  "olive-green","olive-yellow","yellow","mustard-yellow","burgundy","maroon","plum",
  "purple","pink","brown","beige","warm-beige","gray","grey","gold","silver","bronze",
  "orange","rust-orange","cream","ivory","turquoise","teal",
]);

console.log("=== PATTERNS (non-solid) ===");
for (const m of all.filter((x) => !SOLID.has(x.handle))) {
  console.log(`${m.handle.padEnd(28)} ${m.displayName.padEnd(28)} ${m.id}`);
}
console.log(`\nTotal non-solid: ${all.filter((x) => !SOLID.has(x.handle)).length}`);
console.log(`Total all: ${all.length}`);
