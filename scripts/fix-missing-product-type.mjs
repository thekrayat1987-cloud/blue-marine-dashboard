#!/usr/bin/env node
/**
 * Assigns productType to the 11 products that currently have none,
 * matching the existing taxonomy used across the catalog.
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
const URL_ = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

async function gql(query, variables = {}) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const MAPPING = {
  "a148-tareefa-daraa": "Daraa",
  "a149-bayan-caftan": "Caftan",
  "a150-lina-daraa": "Daraa",
  "a151-yara-daraa": "Daraa",
  "a152-zhaira-daraa": "Daraa",
  "a153-rahaf-daraa": "Daraa",
  "a154-hana-daraa": "Daraa",
  "a157-anwar-daraa-set": "Three-Piece Daraa",
  "a158-najla-layered-daraa-set": "Three-Piece Daraa",
  "a159-lamya-daraa-set": "Two-Piece Daraa",
  "a160-wafa-caftan-2-piece-set": "Two-Piece Caftan",
};

async function getProductIdByHandle(handle) {
  const data = await gql(
    `query($q:String!){ products(first:1, query:$q){ edges{ node{ id handle productType title } } } }`,
    { q: `handle:${handle}` }
  );
  return data.products.edges[0]?.node || null;
}

const MUT = `mutation($input: ProductInput!) {
  productUpdate(input: $input) {
    product { id handle productType }
    userErrors { field message }
  }
}`;

const log = [];
for (const [handle, pt] of Object.entries(MAPPING)) {
  const p = await getProductIdByHandle(handle);
  if (!p) { log.push({ handle, status: "NOT_FOUND" }); continue; }
  if (p.productType && p.productType.trim() !== "") {
    log.push({ handle, status: "SKIPPED_ALREADY_SET", existing: p.productType });
    continue;
  }
  const res = await gql(MUT, { input: { id: p.id, productType: pt } });
  if (res.productUpdate.userErrors.length) {
    log.push({ handle, status: "ERROR", errors: res.productUpdate.userErrors });
  } else {
    log.push({ handle, status: "UPDATED", productType: res.productUpdate.product.productType });
  }
}

console.log(JSON.stringify(log, null, 2));
writeFileSync(resolve(__dirname, "..", "fix-missing-product-type.log.json"), JSON.stringify(log, null, 2));
