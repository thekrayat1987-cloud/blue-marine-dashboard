#!/usr/bin/env node
/**
 * List every product that has at least one variant currently out-of-stock + DENY.
 * For each product, show: total variants, OOS variants, in-stock variants.
 * Helps Khadija decide product-by-product: archive whole product, or just hide
 * specific size/length combos.
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

const rows = [];
let after = null;
while (true) {
  const d = await gql(
    `query($after:String){
      products(first:25, after:$after, query:"status:active"){
        edges{ node{
          id handle title totalInventory
          variants(first:100){ edges{ node{ id title inventoryPolicy inventoryQuantity } } }
        } }
        pageInfo{ hasNextPage endCursor }
      }
    }`,
    { after },
  );
  for (const e of d.products.edges) {
    const variants = e.node.variants.edges.map((x) => x.node);
    const total = variants.length;
    const oosDeny = variants.filter((v) => v.inventoryPolicy === "DENY" && (v.inventoryQuantity ?? 0) <= 0).length;
    const inStock = variants.filter((v) => (v.inventoryQuantity ?? 0) > 0).length;
    if (oosDeny > 0) {
      rows.push({
        handle: e.node.handle,
        title: e.node.title,
        total,
        oosDeny,
        inStock,
        totalInventory: e.node.totalInventory,
        oosPercent: Math.round((oosDeny / total) * 100),
      });
    }
  }
  if (!d.products.pageInfo.hasNextPage) break;
  after = d.products.pageInfo.endCursor;
  await sleep(120);
}

rows.sort((a, b) => b.oosPercent - a.oosPercent || b.oosDeny - a.oosDeny);

console.log(`\n=== Produits avec variantes en rupture + DENY (sur store ACTIVE) ===\n`);
console.log(`HANDLE`.padEnd(50), `OOS`.padStart(4), `/`, `TOT`.padStart(4), `INSTOCK`.padStart(8), `%OOS`.padStart(5));
console.log("-".repeat(95));
let allGoneCount = 0;
for (const r of rows) {
  const flag = r.oosPercent === 100 ? "  ←  100% OOS  →  archiver?" : r.oosPercent >= 80 ? "  ←  ≥80% OOS  →  vérifier" : "";
  if (r.oosPercent === 100) allGoneCount++;
  console.log(
    r.handle.padEnd(50),
    r.oosDeny.toString().padStart(4),
    "/",
    r.total.toString().padStart(4),
    r.inStock.toString().padStart(8),
    `${r.oosPercent}%`.padStart(5),
    flag,
  );
}
console.log("-".repeat(95));
console.log(`\nTotal: ${rows.length} produits actifs ont au moins une variante en rupture+DENY.`);
console.log(`     dont ${allGoneCount} produits avec 100% des variantes en rupture (candidats à l'archivage).`);

writeFileSync(
  resolve(__dirname, "..", "out-of-stock-products.json"),
  JSON.stringify({ rows, allGoneCount }, null, 2),
);
console.log(`\nDétail JSON: out-of-stock-products.json`);
