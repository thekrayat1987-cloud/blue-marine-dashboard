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

const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

async function gql(query) {
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  return j;
}

const queries = [
  `{ shop { name primaryDomain { id url host } } }`,
  `{ domains { id host url sslEnabled } }`,
  `{ shop { domains { id host url sslEnabled } } }`,
];

for (const q of queries) {
  console.log("\n--- Query: " + q.replace(/\s+/g, " "));
  const r = await gql(q);
  console.log(JSON.stringify(r, null, 2));
}
