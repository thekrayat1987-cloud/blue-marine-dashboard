#!/usr/bin/env node
/**
 * Inspect A122 and A124 for any remaining "caftan/قفطان" references in EN + AR.
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

const SKUS = ["A122", "A124"];

for (const sku of SKUS) {
  const s = await gql(
    `query($q:String!){ products(first:3, query:$q){
      edges{ node{ id handle title productType tags status descriptionHtml
        seo{ title description } } }
    } }`,
    { q: `title:${sku}*` },
  );
  const node = s.products.edges[0]?.node;
  console.log(`\n${"━".repeat(60)}`);
  console.log(`${sku}`);
  console.log("━".repeat(60));
  if (!node) {
    console.log(`  NOT FOUND`);
    continue;
  }
  console.log(`  id:          ${node.id}`);
  console.log(`  handle:      ${node.handle}`);
  console.log(`  title:       ${node.title}`);
  console.log(`  productType: ${node.productType}`);
  console.log(`  status:      ${node.status}`);
  console.log(`  tags:        ${node.tags.join(", ")}`);
  console.log(`  SEO title:   ${node.seo.title || ""}`);
  console.log(`  SEO desc:    ${node.seo.description || ""}`);

  // Scan EN body
  const enBody = node.descriptionHtml || "";
  const enHasCaftan = /caftan/i.test(enBody);
  console.log(`  EN body has "caftan": ${enHasCaftan}`);

  // Fetch AR translations
  const tr = await gql(
    `query($id:ID!){ translatableResource(resourceId:$id){
      translations(locale:"ar"){ key value }
    } }`,
    { id: node.id },
  );
  const arVals = Object.fromEntries(
    (tr.translatableResource?.translations || []).map((x) => [x.key, x.value]),
  );

  console.log(`  AR title:    ${arVals.title || "(none)"}`);
  console.log(`  AR SEO ttl:  ${arVals.meta_title || "(none)"}`);
  console.log(`  AR SEO desc: ${arVals.meta_description || "(none)"}`);

  // Scan AR for قفطان references
  for (const [k, v] of Object.entries(arVals)) {
    if (!v) continue;
    if (v.includes("قفطان") || v.includes("القفطان") || /caftan/i.test(v)) {
      console.log(`  ⚠️  AR.${k} contains caftan/قفطان:`);
      // show snippet
      const idx = Math.max(
        v.indexOf("قفطان"),
        v.indexOf("القفطان"),
        v.toLowerCase().indexOf("caftan"),
      );
      const start = Math.max(0, idx - 30);
      const end = Math.min(v.length, idx + 60);
      console.log(`     …${v.slice(start, end)}…`);
    }
  }
}
