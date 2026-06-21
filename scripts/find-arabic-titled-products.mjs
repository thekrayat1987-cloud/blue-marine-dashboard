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
const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
let cursor = null;
const arabicProducts = [];
const mixedProducts = [];
const englishProducts = [];
while (true) {
  const d = await gql(`query($cursor:String){
    products(first:50, after:$cursor){
      pageInfo{ hasNextPage endCursor }
      edges{ node{ id title handle } }
    }
  }`, { cursor });
  for (const e of d.products.edges) {
    const t = e.node.title;
    const hasArabic = ARABIC_RE.test(t);
    const hasEnglish = /[a-zA-Z]/.test(t);
    if (hasArabic && hasEnglish) mixedProducts.push(t);
    else if (hasArabic) arabicProducts.push(t);
    else englishProducts.push(t);
  }
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}
console.log(`Total: ${arabicProducts.length + mixedProducts.length + englishProducts.length} products\n`);
console.log(`✅ English-only titles:  ${englishProducts.length}`);
console.log(`⚠️  Mixed (EN + AR) titles: ${mixedProducts.length}`);
console.log(`❌ Arabic-only titles:   ${arabicProducts.length}`);
if (arabicProducts.length) {
  console.log("\n--- Arabic-only ---");
  for (const t of arabicProducts) console.log(`  - ${t}`);
}
if (mixedProducts.length) {
  console.log("\n--- Mixed (first 15) ---");
  for (const t of mixedProducts.slice(0, 15)) console.log(`  - ${t}`);
}
