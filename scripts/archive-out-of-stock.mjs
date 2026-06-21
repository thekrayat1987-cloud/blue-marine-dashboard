#!/usr/bin/env node
/**
 * Archive every ACTIVE product whose total inventory is 0 or less.
 * "Archive" = Shopify status=ARCHIVED → removed from storefront, kept in admin.
 *
 * Excludes:
 *   - the perfume (handle blue-marine-eau-de-parfum-50ml)
 *   - any product where tracksInventory is false (we can't tell if OOS)
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

const EXCLUDED = new Set(["blue-marine-eau-de-parfum-50ml"]);

const products = [];
let after = null;
while (true) {
  const d = await gql(
    `query($after:String){
      products(first:25, after:$after, query:"status:active"){
        edges{ node{
          id handle title status totalInventory tracksInventory
          variants(first:100){ edges{ node{ inventoryQuantity inventoryPolicy } } }
        } }
        pageInfo{ hasNextPage endCursor }
      }
    }`,
    { after },
  );
  for (const e of d.products.edges) products.push(e.node);
  if (!d.products.pageInfo.hasNextPage) break;
  after = d.products.pageInfo.endCursor;
  await sleep(120);
}

const candidates = [];
for (const p of products) {
  if (EXCLUDED.has(p.handle)) continue;
  if (!p.tracksInventory) continue;
  const variants = p.variants.edges.map((e) => e.node);
  const totalQ = variants.reduce((s, v) => s + (v.inventoryQuantity ?? 0), 0);
  if ((p.totalInventory ?? totalQ) <= 0) {
    candidates.push({ id: p.id, handle: p.handle, title: p.title, totalInventory: p.totalInventory ?? totalQ, variantCount: variants.length });
  }
}

console.log(`\n=== ${candidates.length} produits ACTIFS à archiver (rupture totale) ===\n`);
for (const c of candidates) {
  console.log(`  📦 ${c.handle.padEnd(50)} "${c.title}"   variants:${c.variantCount}  inv:${c.totalInventory}`);
}

if (!candidates.length) {
  console.log(`\n→ Rien à archiver. Boutique propre.`);
  process.exit(0);
}

console.log(`\n→ Archivage en cours…\n`);

const log = [];
let archived = 0;
for (const c of candidates) {
  const d = await gql(
    `mutation($input: ProductInput!){
      productUpdate(input:$input){ product{ id status } userErrors{ field message } }
    }`,
    { input: { id: c.id, status: "ARCHIVED" } },
  );
  const errs = d.productUpdate.userErrors;
  if (errs.length) {
    console.log(`  ❌ ${c.handle}: ${JSON.stringify(errs)}`);
    log.push({ handle: c.handle, errors: errs });
  } else {
    archived++;
    console.log(`  ✅ ${c.handle.padEnd(50)} archivé`);
    log.push({ handle: c.handle, archived: true });
  }
  await sleep(180);
}
console.log(`\n✅ ${archived}/${candidates.length} produits archivés.`);
writeFileSync(resolve(__dirname, "..", "archive-out-of-stock.log.json"), JSON.stringify({ archived, candidates, log }, null, 2));
