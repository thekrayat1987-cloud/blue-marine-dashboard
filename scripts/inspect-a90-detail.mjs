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

const cur = await gql(
  `query($h:String!){ productByHandle(handle:$h){
    id handle title tags descriptionHtml
    seo { title description }
    options { name values }
    images(first:5){ edges{ node{ url altText } } }
    variants(first:5){ edges{ node{ selectedOptions{ name value } } } }
  } }`,
  { h: "a90-asala-printed-daraa" },
);
console.log("A90 details:");
console.log("title:    ", cur.productByHandle.title);
console.log("handle:   ", cur.productByHandle.handle);
console.log("SEO title:", cur.productByHandle.seo.title);
console.log("tags:     ", cur.productByHandle.tags.join(", "));
console.log("options:");
for (const o of cur.productByHandle.options) {
  console.log(`  ${o.name}: ${o.values.slice(0, 8).join(", ")}${o.values.length > 8 ? "…" : ""}`);
}
console.log("featured image alt:", cur.productByHandle.images.edges[0]?.node.altText);
console.log("featured image URL:", cur.productByHandle.images.edges[0]?.node.url);
console.log("\nbody HTML (first 500 chars):");
console.log(cur.productByHandle.descriptionHtml.slice(0, 500));
