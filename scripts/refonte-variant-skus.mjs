#!/usr/bin/env node
/**
 * Refonte des SKUs : un SKU unique par variante.
 *
 * Format : <BASE>-<COLOR?>-<SIZE>-<LENGTH>
 *   - BASE = motif <LETTRE><NUMERO> (ex. A123) lu sur le titre produit,
 *            avec fallback sur un SKU de variante existant.
 *   - Couleur d'abord (convention mode), puis taille, puis longueur.
 *   - Pour tout produit n'ayant ni Size ni Length, on enchaîne simplement
 *     les selectedOptions dans l'ordre Shopify, après réordonnancement
 *     Color → Size → Length → autres.
 *
 * Le parfum est exclu.
 *
 * Usage :
 *   node scripts/refonte-variant-skus.mjs                  # dry-run global
 *   node scripts/refonte-variant-skus.mjs --apply          # écrit dans Shopify
 *   node scripts/refonte-variant-skus.mjs --handle=alkhairan-noir          # dry-run ciblé
 *   node scripts/refonte-variant-skus.mjs --apply --handle=alkhairan-noir  # apply ciblé
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

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const HANDLE_FILTER = (args.find((a) => a.startsWith("--handle=")) || "").split("=")[1] || null;

const EXCLUDED_HANDLES = new Set(["blue-marine-eau-de-parfum-50ml"]);
const BASE_RE = /\b([A-Z])(\d{2,5})\b/;

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

function sanitize(value) {
  return String(value)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "");
}

function findBaseSku(product) {
  const titleMatch = product.title.match(BASE_RE);
  if (titleMatch) return `${titleMatch[1]}${titleMatch[2]}`;
  for (const e of product.variants.edges) {
    const sku = e.node.sku || "";
    const m = sku.match(BASE_RE);
    if (m) return `${m[1]}${m[2]}`;
  }
  return null;
}

const OPTION_PRIORITY = { color: 0, couleur: 0, size: 1, taille: 1, length: 2, longueur: 2 };

function orderedOptionValues(variant) {
  const options = variant.selectedOptions.slice();
  options.sort((a, b) => {
    const pa = OPTION_PRIORITY[a.name.toLowerCase()] ?? 99;
    const pb = OPTION_PRIORITY[b.name.toLowerCase()] ?? 99;
    return pa - pb;
  });
  return options.map((o) => sanitize(o.value)).filter(Boolean);
}

function computeSku(base, variant) {
  const parts = [base, ...orderedOptionValues(variant)];
  return parts.join("-");
}

console.log(`Mode : ${APPLY ? "APPLY (écriture)" : "DRY-RUN (aucune écriture)"}`);
if (HANDLE_FILTER) console.log(`Filtre handle : ${HANDLE_FILTER}`);

const products = [];
let after = null;
while (true) {
  const d = await gql(
    `query($after:String){
      products(first:25, after:$after){
        edges{ node{
          id handle title status
          variants(first:100){ edges{ node{
            id sku
            selectedOptions{ name value }
          } } }
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

console.log(`Chargé ${products.length} produits.`);

const log = [];
let productsTouched = 0;
let variantsUpdated = 0;
let variantsSkipped = 0;
const collisions = new Map();

for (const p of products) {
  if (EXCLUDED_HANDLES.has(p.handle)) continue;
  if (HANDLE_FILTER && p.handle !== HANDLE_FILTER) continue;

  const base = findBaseSku(p);
  if (!base) {
    console.log(`  ⚠️  ${p.handle}: pas de BASE SKU détectable, ignoré`);
    log.push({ handle: p.handle, skipped: "no_base_sku" });
    continue;
  }

  const planned = [];
  const seen = new Set();
  for (const e of p.variants.edges) {
    const v = e.node;
    const newSku = computeSku(base, v);
    if (seen.has(newSku)) {
      collisions.set(`${p.handle}:${newSku}`, (collisions.get(`${p.handle}:${newSku}`) || 0) + 1);
    }
    seen.add(newSku);
    planned.push({ id: v.id, currentSku: v.sku, newSku });
  }

  const toUpdate = planned.filter((x) => x.currentSku !== x.newSku);
  variantsSkipped += planned.length - toUpdate.length;

  if (!toUpdate.length) {
    console.log(`  • ${p.handle} (${base}): déjà aligné (${planned.length} variantes)`);
    log.push({ handle: p.handle, base, alreadyAligned: planned.length });
    continue;
  }

  console.log(`  → ${p.handle} (${base}): ${toUpdate.length}/${planned.length} variantes à mettre à jour`);
  for (const x of toUpdate.slice(0, 3)) console.log(`      ${x.currentSku || "∅"}  →  ${x.newSku}`);
  if (toUpdate.length > 3) console.log(`      … et ${toUpdate.length - 3} de plus`);

  if (!APPLY) {
    log.push({ handle: p.handle, base, plannedUpdates: toUpdate });
    continue;
  }

  const variantsInput = toUpdate.map((x) => ({ id: x.id, inventoryItem: { sku: x.newSku } }));
  const d = await gql(
    `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        product { id }
        userErrors { field message }
      }
    }`,
    { productId: p.id, variants: variantsInput },
  );
  const errs = d.productVariantsBulkUpdate.userErrors;
  if (errs.length) {
    console.log(`    ❌ ${p.handle}: ${JSON.stringify(errs)}`);
    log.push({ handle: p.handle, base, errors: errs, attempted: toUpdate });
  } else {
    productsTouched++;
    variantsUpdated += toUpdate.length;
    log.push({ handle: p.handle, base, updated: toUpdate });
  }
  await sleep(220);
}

if (collisions.size) {
  console.log(`\n⚠️  Collisions de SKU détectées (mêmes options sur plusieurs variantes) :`);
  for (const [k, v] of collisions) console.log(`   ${k} ×${v + 1}`);
}

console.log(
  `\n${APPLY ? "✅" : "📝"} ${APPLY ? "Terminé" : "Dry-run terminé"} — ${variantsUpdated} variantes ${
    APPLY ? "mises à jour" : "à mettre à jour"
  } sur ${productsTouched || log.filter((l) => l.plannedUpdates).length} produits ; ${variantsSkipped} déjà alignées.`,
);

writeFileSync(
  resolve(__dirname, "..", "refonte-variant-skus.log.json"),
  JSON.stringify({ mode: APPLY ? "apply" : "dry-run", handleFilter: HANDLE_FILTER, log }, null, 2),
);
console.log(`Log : dashboard/refonte-variant-skus.log.json`);
