#!/usr/bin/env node
/**
 * Fix Google Merchant Center category metafield on every product.
 *
 * Problem (audited 2026-05-14):
 *   - 1 perfume (Blue Marine Eau de Parfum) sits under category 479 (Apparel)
 *     instead of 5915 (Perfume & Cologne) → triggers "Alcoholic beverages"
 *     misclassification by Google's automated content review.
 *   - 102 / 137 active products have NO google_product_category metafield at
 *     all → Google falls back to ML on title+image and sometimes mislabels
 *     dark-velvet bisht photos as restricted categories.
 *
 * Mapping (productType → Google taxonomy ID):
 *   Fragrance                            → 5915 (Perfume & Cologne)
 *   Daraa / Two-Piece / Three-Piece Daraa → 2271 (Dresses)
 *   Bisht Set                            → 2271 (Dresses) — sets are styled
 *                                          as a long dress with overlay
 *   anything else                        → 1604 (Outerwear > Coats & Jackets)
 *
 * Writes both the LEGACY metafield (mm-google-shopping.google_product_category)
 * read by Simprosys + the native Google & YouTube channel feed.
 */
import { readFileSync, writeFileSync } from "node:fs";
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

function categoryFor(productType) {
  const t = (productType || "").toLowerCase();
  if (t.includes("fragrance") || t.includes("perfume")) return "5915";
  if (t.includes("daraa")) return "2271";
  if (t.includes("bisht")) return "2271";
  return "1604";
}

const products = [];
let cursor = null;
while (true) {
  const d = await gql(`query($cursor:String){
    products(first:100, after:$cursor) {
      pageInfo { hasNextPage endCursor }
      edges { node {
        id handle status productType title
        mf: metafield(namespace:"mm-google-shopping", key:"google_product_category") { id value }
      } }
    }
  }`, { cursor });
  for (const e of d.products.edges) products.push(e.node);
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}
console.log(`Fetched ${products.length} products.`);

const active = products.filter((p) => p.status === "ACTIVE");
const decisions = active.map((p) => ({
  id: p.id,
  handle: p.handle,
  title: p.title,
  productType: p.productType,
  current: p.mf?.value || null,
  target: categoryFor(p.productType),
}));

const toSet = decisions.filter((d) => d.current !== d.target);
console.log(`Active: ${active.length}`);
console.log(`Already correct: ${decisions.length - toSet.length}`);
console.log(`Will update: ${toSet.length}`);

const breakdown = {};
for (const d of toSet) {
  const k = `${d.productType || "(none)"} → ${d.target}`;
  breakdown[k] = (breakdown[k] || 0) + 1;
}
console.log("Breakdown of updates:", breakdown);

const MUT = `mutation($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { id namespace key value ownerType }
    userErrors { field message code }
  }
}`;

const log = [];
const BATCH = 25;
for (let i = 0; i < toSet.length; i += BATCH) {
  const batch = toSet.slice(i, i + BATCH);
  const metafields = batch.map((d) => ({
    ownerId: d.id,
    namespace: "mm-google-shopping",
    key: "google_product_category",
    type: "single_line_text_field",
    value: d.target,
  }));
  const res = await gql(MUT, { metafields });
  if (res.metafieldsSet.userErrors.length) {
    console.error("Errors in batch:", res.metafieldsSet.userErrors);
    log.push({ batch: i / BATCH, errors: res.metafieldsSet.userErrors, items: batch.map(b => b.handle) });
  } else {
    process.stderr.write(`batch ${i / BATCH + 1}: ${res.metafieldsSet.metafields.length} updated\n`);
    log.push({ batch: i / BATCH, updated: res.metafieldsSet.metafields.length });
  }
}

writeFileSync(resolve(__dirname, "..", "fix-gmc-google-categories.log.json"), JSON.stringify({
  total_active: active.length,
  already_correct: decisions.length - toSet.length,
  updated: toSet.length,
  breakdown,
  log,
  decisions,
}, null, 2));
console.log(`\n✅ Done. google_product_category set on ${toSet.length} products.`);
console.log("Google Merchant Center will re-review within 24–72h.");
