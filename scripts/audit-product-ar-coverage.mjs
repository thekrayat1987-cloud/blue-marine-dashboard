#!/usr/bin/env node
/**
 * Audit AR translation coverage on every product.
 * For each product, check title / body_html / meta_title / meta_description.
 * Reports counts + writes per-product detail to product-ar-audit.json.
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

const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query, variables) {
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const KEYS = ["title", "body_html", "meta_title", "meta_description"];

async function fetchPage(after) {
  return gql(
    `query($after: String) {
      translatableResources(resourceType: PRODUCT, first: 50, after: $after) {
        edges {
          cursor
          node {
            resourceId
            translatableContent { key value }
            translations(locale: "ar") { key value }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    { after },
  );
}

async function fetchProductMeta(ids) {
  if (!ids.length) return {};
  const d = await gql(
    `query($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Product { id handle title status }
      }
    }`,
    { ids },
  );
  const map = {};
  for (const n of d.nodes) if (n) map[n.id] = n;
  return map;
}

const rows = [];
let after = null;
let pages = 0;
while (true) {
  const d = await fetchPage(after);
  const r = d.translatableResources;
  for (const e of r.edges) {
    const sourceKeys = new Set(e.node.translatableContent.map((c) => c.key));
    const sourceValues = {};
    for (const c of e.node.translatableContent) sourceValues[c.key] = (c.value || "").trim();
    const arKeys = new Set();
    for (const t of e.node.translations) if ((t.value || "").trim()) arKeys.add(t.key);
    const present = KEYS.filter((k) => arKeys.has(k));
    const missing = KEYS.filter((k) => !arKeys.has(k));
    const sourceMissing = KEYS.filter((k) => !sourceKeys.has(k) || !sourceValues[k]);
    rows.push({ rid: e.node.resourceId, present, missing, sourceMissing });
  }
  pages++;
  if (!r.pageInfo.hasNextPage) break;
  after = r.pageInfo.endCursor;
  if (pages > 50) break;
  await sleep(150);
}

const meta = await fetchProductMeta(rows.map((r) => r.rid));
for (const r of rows) {
  const m = meta[r.rid] || {};
  r.handle = m.handle;
  r.title = m.title;
  r.status = m.status;
}

const full = rows.filter((r) => r.present.length === 4);
const partial = rows.filter((r) => r.present.length > 0 && r.present.length < 4);
const empty = rows.filter((r) => r.present.length === 0);

console.log(`\n=== Product AR translation coverage ===`);
console.log(`Total products: ${rows.length}`);
console.log(`✅ Full 4/4: ${full.length}`);
console.log(`⚠️  Partial:  ${partial.length}`);
console.log(`❌ None:     ${empty.length}\n`);

// Bucket partials by which keys are missing
const buckets = {};
for (const r of [...partial, ...empty]) {
  const k = r.missing.join(",") || "none";
  buckets[k] = (buckets[k] || 0) + 1;
}
console.log("Missing-key patterns:");
for (const [k, n] of Object.entries(buckets).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n.toString().padStart(4)}  missing: ${k}`);
}

// Source-side gaps (can't translate what doesn't exist in EN)
const sourceGaps = {};
for (const r of rows) {
  for (const k of r.sourceMissing) sourceGaps[k] = (sourceGaps[k] || 0) + 1;
}
console.log("\nSource (EN) gaps — these need EN written before AR can be registered:");
for (const [k, n] of Object.entries(sourceGaps)) {
  console.log(`  ${n.toString().padStart(4)}  empty/missing in EN: ${k}`);
}

console.log("\nFirst 15 partial/empty products:");
for (const r of [...empty, ...partial].slice(0, 15)) {
  console.log(`  [${r.status || "?"}] ${(r.handle || "?").padEnd(40)} have:${r.present.length}/4 missing:${r.missing.join(",")}`);
}

const out = resolve(__dirname, "..", "product-ar-audit.json");
writeFileSync(out, JSON.stringify({ full: full.length, partial: partial.length, empty: empty.length, rows }, null, 2));
console.log(`\nFull report: ${out}`);
