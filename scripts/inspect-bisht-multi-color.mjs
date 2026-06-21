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

const HANDLES = [
  "a56-yaqut-burgundy-bisht-set",
  "a57-bahar-bisht-set",
  "a80-amira-velvet-bisht-set",
  "a81-sahar-velvet-bisht",
];

for (const h of HANDLES) {
  const d = await gql(
    `query($q: String!) {
      products(first: 1, query: $q) {
        edges { node {
          id handle title
          options { name values }
        } }
      }
    }`,
    { q: `handle:${h}` },
  );
  const p = d.products.edges[0]?.node;
  console.log(`\n${h} → ${p.title}`);
  for (const o of p.options) {
    console.log(`  ${o.name}: [${o.values.join(", ")}]`);
  }
}
