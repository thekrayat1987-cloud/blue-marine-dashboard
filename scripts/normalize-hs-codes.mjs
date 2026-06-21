#!/usr/bin/env node
/**
 * Normalize HS codes for multi-piece daraa products.
 *
 * Audit results (2026-05-14):
 *   - Daraa: 100% on 6204.49 ✅ (dresses) — no change
 *   - Bisht Set: 100% on 6204.49 ✅ (acceptable as dress-centered set) — no change
 *   - Two-Piece Daraa: MIXED (620419=100, 620449=993) — normalize to 6204.29
 *   - Three-Piece Daraa: MIXED (620419=100, 620449=154) — normalize to 6204.29
 *   - Fragrance: 3303.00 ✅ — no change
 *
 * 6204.29 = women's ensembles (coordinated multi-piece outfit), the correct
 * tariff classification for daraa sets containing 2+ garments.
 *
 * Dry-run: node scripts/normalize-hs-codes.mjs
 * Apply:   node scripts/normalize-hs-codes.mjs --apply
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

const TARGET_TYPES = new Set(["Two-Piece Daraa", "Three-Piece Daraa"]);
const TARGET_HS = "620429";

// Collect inventoryItem IDs that need updating
const toUpdate = [];
const counts = new Map();
let cursor = null;
while (true) {
  const d = await gql(`query($cursor:String){
    products(first:50, after:$cursor){
      pageInfo{ hasNextPage endCursor }
      edges{ node{
        title productType
        variants(first:100){ edges{ node{
          inventoryItem { id harmonizedSystemCode countryCodeOfOrigin }
        }}}
      }}
    }
  }`, { cursor });
  for (const e of d.products.edges) {
    const p = e.node;
    if (!TARGET_TYPES.has(p.productType)) continue;
    for (const ve of p.variants.edges) {
      const inv = ve.node.inventoryItem;
      if (inv.harmonizedSystemCode !== TARGET_HS) {
        toUpdate.push({
          id: inv.id,
          from: inv.harmonizedSystemCode,
          country: inv.countryCodeOfOrigin || "KW",
        });
        const key = `${p.productType}: ${inv.harmonizedSystemCode}→${TARGET_HS}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  }
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}

console.log(`Variants to update: ${toUpdate.length}`);
for (const [k, n] of counts) console.log(`  ${k}: ${n}`);

if (toUpdate.length === 0) {
  console.log("✅ Nothing to do — all multi-piece daraa already on 6204.29");
  process.exit(0);
}

if (!APPLY) {
  console.log("\nℹ️  Dry-run only. Re-run with --apply to push to Shopify.");
  process.exit(0);
}

const mutation = `
mutation Upd($id: ID!, $input: InventoryItemInput!) {
  inventoryItemUpdate(id: $id, input: $input) {
    inventoryItem { id harmonizedSystemCode countryCodeOfOrigin }
    userErrors { field message }
  }
}`;

let done = 0, failed = 0;
for (const item of toUpdate) {
  const r = await gql(mutation, {
    id: item.id,
    input: { harmonizedSystemCode: TARGET_HS, countryCodeOfOrigin: item.country },
  });
  const errs = r.inventoryItemUpdate.userErrors;
  if (errs.length) {
    failed++;
    console.error(`  ❌ ${item.id}: ${errs.map(e => e.message).join("; ")}`);
  } else {
    done++;
    if (done % 50 === 0) console.log(`  …${done}/${toUpdate.length}`);
  }
}
console.log(`\n✅ Updated: ${done}`);
if (failed) console.log(`❌ Failed: ${failed}`);
