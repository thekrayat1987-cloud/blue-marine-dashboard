#!/usr/bin/env node
/**
 * Auto-assign productType on every product based on handle pattern.
 * Required for Google Shopping / Performance Max / Meta Catalog facets.
 *
 * Mapping (longest match wins):
 *   eau-de-parfum / parfum                           -> Fragrance
 *   bisht + (set|trio|3-piece|three)                 -> Bisht Set
 *   bisht                                            -> Bisht
 *   3-piece-daraa-set / three-piece                  -> Three-Piece Daraa
 *   2-piece-set-daraa / two-piece                    -> Two-Piece Daraa
 *   caftan / kaftan                                  -> Caftan
 *   daraa / darra / dera                             -> Daraa
 *   default                                          -> Daraa
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

function pickType(handle, currentType) {
  const h = (handle || "").toLowerCase();
  if (h.includes("eau-de-parfum") || h.includes("parfum")) return "Fragrance";
  if (h.includes("bisht") && (h.includes("set") || h.includes("trio") || h.includes("3-piece") || h.includes("three"))) return "Bisht Set";
  if (h.includes("bisht")) return "Bisht";
  if (h.includes("3-piece") || h.includes("three-piece") || h.includes("3piece")) return "Three-Piece Daraa";
  if (h.includes("2-piece") || h.includes("two-piece") || h.includes("2piece")) return "Two-Piece Daraa";
  if (h.includes("caftan") || h.includes("kaftan")) return "Caftan";
  return "Daraa";
}

const products = [];
{
  let after = null;
  while (true) {
    const d = await gql(
      `query($after:String){
        products(first:50, after:$after){
          edges{ node{ id handle title productType status } }
          pageInfo{ hasNextPage endCursor }
        }
      }`,
      { after },
    );
    for (const e of d.products.edges) products.push(e.node);
    if (!d.products.pageInfo.hasNextPage) break;
    after = d.products.pageInfo.endCursor;
    await sleep(100);
  }
}

console.log(`Loaded ${products.length} products`);

const log = [];
let touched = 0;
const distribution = {};

for (const p of products) {
  const target = pickType(p.handle, p.productType);
  if ((p.productType || "") === target) continue; // already set correctly
  const d = await gql(
    `mutation($input: ProductInput!){
      productUpdate(input:$input){ product{ id productType } userErrors{ field message } }
    }`,
    { input: { id: p.id, productType: target } },
  );
  const errs = d.productUpdate.userErrors;
  if (errs.length) {
    console.log(`  ❌ ${p.handle}: ${JSON.stringify(errs)}`);
    log.push({ handle: p.handle, errors: errs });
  } else {
    touched++;
    distribution[target] = (distribution[target] || 0) + 1;
    console.log(`  ✅ ${p.handle.padEnd(50)} -> ${target}`);
    log.push({ handle: p.handle, productType: target });
  }
  await sleep(180);
}

console.log(`\n✅ Done. ${touched} products updated.`);
console.log(`Distribution:`);
for (const [k, n] of Object.entries(distribution).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n.toString().padStart(4)}  ${k}`);
}
writeFileSync(resolve(__dirname, "..", "fill-product-type.log.json"), JSON.stringify({ distribution, log }, null, 2));
