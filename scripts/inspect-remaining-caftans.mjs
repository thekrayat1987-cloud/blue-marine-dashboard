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

// Also scan ALL active products for "caftan" / "قفطان" leaks
const all = [];
let cursor = null;
do {
  const r = await gql(
    `query($c:String){ products(first:100, after:$c, query:"status:active"){
      pageInfo{ hasNextPage endCursor }
      edges{ node{ id handle title productType tags descriptionHtml
        seo{ title description } } }
    } }`,
    { c: cursor },
  );
  for (const e of r.products.edges) all.push(e.node);
  cursor = r.products.pageInfo.hasNextPage ? r.products.pageInfo.endCursor : null;
} while (cursor);

const hits = [];
for (const p of all) {
  const enHay = [
    p.title,
    p.handle,
    p.tags.join(" "),
    p.seo.title || "",
    p.seo.description || "",
    p.descriptionHtml || "",
  ].join(" ");
  if (/caftan/i.test(enHay) || /قفطان/.test(enHay)) {
    // Pull AR
    const tr = await gql(
      `query($id:ID!){ translatableResource(resourceId:$id){
        translations(locale:"ar"){ key value }
      } }`,
      { id: p.id },
    );
    const arVals = Object.fromEntries(
      (tr.translatableResource?.translations || []).map((x) => [x.key, x.value]),
    );
    const arHay = Object.values(arVals).join(" ");
    hits.push({
      sku: (p.title.match(/^A(\d+)/) || [])[0] || p.title,
      handle: p.handle,
      title: p.title,
      productType: p.productType,
      tags: p.tags.filter((t) => /caftan|قفطان/i.test(t)),
      enHasCaftan: /caftan/i.test(p.descriptionHtml || ""),
      enSeoTitle: p.seo.title,
      enSeoHasCaftan: /caftan/i.test(p.seo.title || "") || /caftan/i.test(p.seo.description || ""),
      arTitle: arVals.title,
      arSeoTitle: arVals.meta_title,
      arSeoDesc: arVals.meta_description,
      arHasQaftan: /قفطان/.test(arHay),
    });
  }
}

console.log(`\nFound ${hits.length} product(s) with caftan/قفطان references:\n`);
for (const h of hits) {
  console.log(`━━ ${h.sku} ━━`);
  console.log(`  handle:        ${h.handle}`);
  console.log(`  EN title:      ${h.title}`);
  console.log(`  AR title:      ${h.arTitle}`);
  console.log(`  productType:   ${h.productType}`);
  console.log(`  caftan tags:   ${h.tags.join(", ") || "(none)"}`);
  console.log(`  EN body has "caftan":     ${h.enHasCaftan}`);
  console.log(`  EN SEO has "caftan":      ${h.enSeoHasCaftan}`);
  console.log(`  EN SEO title:  ${h.enSeoTitle}`);
  console.log(`  AR has قفطان anywhere:    ${h.arHasQaftan}`);
  console.log(`  AR SEO title:  ${h.arSeoTitle}`);
  console.log(`  AR SEO desc:   ${h.arSeoDesc}`);
  console.log();
}
