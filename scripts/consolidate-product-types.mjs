#!/usr/bin/env node
/**
 * Consolidate productType per Khadija's taxonomy:
 *  - No "Caftan" or "Two-Piece Caftan" — all caftans are Daraa / Two-Piece Daraa
 *  - No single "Bisht" — all bishts are "Bisht Set"
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
async function gql(q, v = {}) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN },
    body: JSON.stringify({ query: q, variables: v }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const MAPPING = {
  // Caftan (single) -> Daraa
  "a122-layali-caftan": "Daraa",
  "a124-noor-printed-caftan": "Daraa",
  "a132-hawa-caftan": "Daraa",
  "a149-bayan-caftan": "Daraa",
  // Caftan sets -> Two-Piece Daraa
  "a130-sultana-caftan-set": "Two-Piece Daraa",
  // Two-Piece Caftan -> Two-Piece Daraa
  "a160-wafa-caftan-2-piece-set": "Two-Piece Daraa",
  // Bisht (single) -> Bisht Set
  "a81-sahar-velvet-bisht": "Bisht Set",
  "a110-sahar-black-bisht": "Bisht Set",
  "a114-sahar-bisht": "Bisht Set",
  // Flagged items per Khadija: both go to Bisht Set
  "a143-aroob-caftan-set": "Bisht Set",
  "a96-zumurud-bisht-daraa": "Bisht Set",
};

async function getProductByHandle(handle) {
  const d = await gql(
    `query($q:String!){ products(first:1, query:$q){ edges{ node{ id handle productType title } } } }`,
    { q: `handle:${handle}` }
  );
  return d.products.edges[0]?.node || null;
}

const MUT = `mutation($input: ProductInput!) {
  productUpdate(input: $input) {
    product { id handle productType }
    userErrors { field message }
  }
}`;

const log = [];
for (const [handle, pt] of Object.entries(MAPPING)) {
  const p = await getProductByHandle(handle);
  if (!p) { log.push({ handle, status: "NOT_FOUND" }); continue; }
  if (p.productType === pt) {
    log.push({ handle, status: "ALREADY_CORRECT", productType: pt });
    continue;
  }
  const res = await gql(MUT, { input: { id: p.id, productType: pt } });
  if (res.productUpdate.userErrors.length) {
    log.push({ handle, status: "ERROR", errors: res.productUpdate.userErrors });
  } else {
    log.push({ handle, from: p.productType, to: res.productUpdate.product.productType, status: "UPDATED" });
  }
}

console.log(JSON.stringify(log, null, 2));
writeFileSync(resolve(__dirname, "..", "consolidate-product-types.log.json"), JSON.stringify(log, null, 2));
