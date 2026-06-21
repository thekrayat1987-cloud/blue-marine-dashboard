#!/usr/bin/env node
/**
 * Fix customs information on all product variants:
 *   1. Set country of origin = Kuwait (KW) on every variant that's missing it
 *   2. Set Harmonized System (HS) code per product-type taxonomy where missing
 *
 * Mapping (chosen as the safe default — "other textile materials" suffix
 * avoids needing to know exact fabric composition per product):
 *
 *   Product type          → HS code   Description
 *   ────────────────────────────────────────────────────────────────
 *   Daraa                 → 620449    Women's dresses, of other textile materials
 *   Two-Piece Daraa       → 620419    Women's suits/ensembles, of other textile materials
 *   Three-Piece Daraa     → 620419    Women's suits/ensembles, of other textile materials
 *   Bisht Set             → 620419    Women's suits/ensembles (coordinated multi-piece outfit)
 *   Fragrance             → 330300    Perfumes and toilet waters
 *   (unknown/fallback)    → 620449    Women's dresses default
 *
 * Dry-run: node scripts/fix-customs-info.mjs
 * Apply:   node scripts/fix-customs-info.mjs --apply
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
const APPLY = process.argv.includes("--apply");

const HS_BY_TYPE = {
  "Daraa": "620449",
  "Two-Piece Daraa": "620419",
  "Three-Piece Daraa": "620419",
  "Bisht Set": "620419",
  "Fragrance": "330300",
};
const HS_FALLBACK = "620449";
const ORIGIN_COUNTRY = "KW";

async function gql(q, v = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const r = await fetch(URL_, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
      body: JSON.stringify({ query: q, variables: v }),
    });
    if (r.status === 429) {
      const wait = 2000 * (i + 1);
      console.log(`  ⏳ 429 throttled, waiting ${wait}ms`);
      await new Promise(res => setTimeout(res, wait));
      continue;
    }
    const j = await r.json();
    if (j.errors) {
      const throttled = j.errors.some(e => e.extensions?.code === "THROTTLED");
      if (throttled && i < retries - 1) {
        await new Promise(res => setTimeout(res, 2000 * (i + 1)));
        continue;
      }
      throw new Error(JSON.stringify(j.errors));
    }
    return j.data;
  }
  throw new Error("gql exhausted retries");
}

// 1) Fetch every variant with its product type + current customs fields
console.log("Fetching all products and variants…");
const all = [];
let cursor = null;
while (true) {
  const d = await gql(`query($cursor:String){
    products(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges { node {
        id title productType
        variants(first: 100) {
          edges { node {
            id title
            inventoryItem {
              id
              countryCodeOfOrigin
              harmonizedSystemCode
            }
          }}
        }
      }}
    }
  }`, { cursor });
  for (const e of d.products.edges) {
    const p = e.node;
    for (const v of p.variants.edges) {
      all.push({
        productTitle: p.title,
        productType: p.productType,
        variantId: v.node.id,
        variantTitle: v.node.title,
        inventoryItemId: v.node.inventoryItem.id,
        countryCodeOfOrigin: v.node.inventoryItem.countryCodeOfOrigin,
        harmonizedSystemCode: v.node.inventoryItem.harmonizedSystemCode,
      });
    }
  }
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
  process.stdout.write(`  …${all.length} variants so far\r`);
}
console.log(`\n  Total: ${all.length} variants across products.\n`);

// 2) Compute updates needed
const updates = [];
const typeCounts = {};
let missingType = 0;
for (const v of all) {
  const needCountry = !v.countryCodeOfOrigin;
  const needHS = !v.harmonizedSystemCode;
  if (!needCountry && !needHS) continue;
  const desiredHS = HS_BY_TYPE[v.productType] || HS_FALLBACK;
  if (!HS_BY_TYPE[v.productType]) missingType++;
  typeCounts[v.productType || "(empty)"] = (typeCounts[v.productType || "(empty)"] || 0) + 1;
  updates.push({
    inventoryItemId: v.inventoryItemId,
    variantInfo: `${v.productTitle} / ${v.variantTitle}`,
    productType: v.productType,
    setCountry: needCountry ? ORIGIN_COUNTRY : null,
    setHS: needHS ? desiredHS : null,
  });
}

console.log("━━━ Update plan ━━━");
console.log(`  Variants needing customs update: ${updates.length} / ${all.length}`);
console.log();
console.log("  Breakdown by product type (variants needing update):");
for (const [t, c] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
  const hs = HS_BY_TYPE[t] || HS_FALLBACK;
  console.log(`    ${(t || "(empty)").padEnd(20)} → HS ${hs}  [${c} variants]`);
}
if (missingType > 0) {
  console.log(`  ⚠️  ${missingType} variants have an unrecognized product type → fallback HS ${HS_FALLBACK}`);
}
console.log();

if (!APPLY) {
  console.log("ℹ️  Dry-run only. Re-run with --apply to push to Shopify.");
  console.log(`   Expected wall time at ~10 req/s: ${Math.ceil(updates.length / 10)} seconds`);
  process.exit(0);
}

// 3) Apply updates with controlled concurrency
const MUT = `
mutation Update($id: ID!, $input: InventoryItemInput!) {
  inventoryItemUpdate(id: $id, input: $input) {
    inventoryItem { id }
    userErrors { field message }
  }
}`;

console.log(`Applying ${updates.length} updates (concurrency 5)…`);
let ok = 0, fail = 0;
const errors = [];

async function applyOne(u) {
  const input = {};
  if (u.setCountry) input.countryCodeOfOrigin = u.setCountry;
  if (u.setHS) input.harmonizedSystemCode = u.setHS;
  try {
    const res = await gql(MUT, { id: u.inventoryItemId, input });
    const errs = res.inventoryItemUpdate.userErrors;
    if (errs.length) {
      fail++;
      errors.push({ variant: u.variantInfo, errs });
    } else {
      ok++;
    }
  } catch (e) {
    fail++;
    errors.push({ variant: u.variantInfo, errs: [{ message: e.message }] });
  }
}

const queue = [...updates];
const CONCURRENCY = 5;
async function worker() {
  while (queue.length) {
    const u = queue.shift();
    if (!u) break;
    await applyOne(u);
    if ((ok + fail) % 100 === 0) {
      process.stdout.write(`  ${ok + fail}/${updates.length} (${ok} ok, ${fail} fail)\r`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

console.log(`\n✅ Done. ${ok} succeeded, ${fail} failed.`);
if (errors.length) {
  console.log("\nFirst 10 errors:");
  for (const e of errors.slice(0, 10)) {
    console.log(`  - ${e.variant}: ${e.errs.map(x => x.message).join("; ")}`);
  }
}
