#!/usr/bin/env node
/**
 * Link product Color/Size options + their option values to Shopify taxonomy
 * metaobjects. This is what Shopify's apparel category validator wants —
 * without it, every variant throws "Color/Size is required" errors.
 *
 * Run with --dry-run to preview, default applies changes.
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
const DRY_RUN = process.argv.includes("--dry-run");

async function gql(q, v = {}) {
  const r = await fetch(URL_, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN }, body: JSON.stringify({ query: q, variables: v }) });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

// Shopify Taxonomy metaobjects
const COLOR_GID = {
  Pink: "gid://shopify/Metaobject/176780116268",
  Yellow: "gid://shopify/Metaobject/174696300844",
  Grey: "gid://shopify/Metaobject/169946775852",
  Black: "gid://shopify/Metaobject/169808855340",
  White: "gid://shopify/Metaobject/174967226668",
  Blue: "gid://shopify/Metaobject/171100864812",
  Navy: "gid://shopify/Metaobject/185972785452",
  Green: "gid://shopify/Metaobject/169844736300",
  Red: "gid://shopify/Metaobject/169927180588",
  Olive: "gid://shopify/Metaobject/184192794924",
  Burgundy: "gid://shopify/Metaobject/170104586540",
  Ivory: "gid://shopify/Metaobject/184192958764",
  Beige: "gid://shopify/Metaobject/170956882220",
  Brown: "gid://shopify/Metaobject/171073175852",
  Gold: "gid://shopify/Metaobject/170103734572",
  Purple: "gid://shopify/Metaobject/169943793964",
  Orange: "gid://shopify/Metaobject/170951311660",
  Mustard: "gid://shopify/Metaobject/195137863980",
  Emerald: "gid://shopify/Metaobject/195137831212",
  Turquoise: "gid://shopify/Metaobject/171100864812", // same as Blue (no dedicated turquoise)
  Bronze: "gid://shopify/Metaobject/184191582508",
  Plum: "gid://shopify/Metaobject/184192925996",
};
const SIZE_GID = {
  XS: "gid://shopify/Metaobject/172699877676",
  S: "gid://shopify/Metaobject/172699910444",
  M: "gid://shopify/Metaobject/172699943212",
  L: "gid://shopify/Metaobject/172699975980",
  XL: "gid://shopify/Metaobject/172700008748",
  "2XL": "gid://shopify/Metaobject/172700041516",
  "3XL": "gid://shopify/Metaobject/172700205356",
};

function matchColor(name) {
  const lower = name.toLowerCase().trim();
  // Exact match
  for (const k of Object.keys(COLOR_GID)) if (k.toLowerCase() === lower) return COLOR_GID[k];
  // Special phrase handling
  if (/\b(rose)\b/.test(lower)) return COLOR_GID.Pink;
  if (/teal/.test(lower)) return COLOR_GID.Turquoise;
  if (/\b(rust|burnt|sunset)\b/.test(lower)) return COLOR_GID.Orange;
  if (/berry/.test(lower)) return COLOR_GID.Burgundy;
  if (/fuchsia/.test(lower)) return COLOR_GID.Pink;
  if (/ruby/.test(lower)) return COLOR_GID.Red;
  if (/forest/.test(lower)) return COLOR_GID.Green;
  if (/royal navy|deep navy/.test(lower)) return COLOR_GID.Navy;
  if (/royal blue/.test(lower)) return COLOR_GID.Blue;
  if (/dusty rose|fuchsia/.test(lower)) return COLOR_GID.Pink;
  if (/multi patchwork|patchwork/.test(lower)) return COLOR_GID.Brown;
  if (/\bmix\b|\bfloral\b|multicolor/.test(lower)) {
    // Compound — find primary color in the string
    for (const k of Object.keys(COLOR_GID)) if (lower.includes(k.toLowerCase())) return COLOR_GID[k];
  }
  // Substring match
  for (const k of Object.keys(COLOR_GID)) if (lower.includes(k.toLowerCase())) return COLOR_GID[k];
  // Specific known-but-unmapped Blue Marine colors
  if (/turquoise/.test(lower)) return COLOR_GID.Turquoise;
  if (/golden|mustard/.test(lower)) return COLOR_GID.Mustard;
  if (/plum/.test(lower)) return COLOR_GID.Plum;
  return null;
}

function matchSize(name) {
  const norm = name.trim().toUpperCase();
  return SIZE_GID[norm] || null;
}

// Fetch all products
const all = [];
let cursor = null;
while (true) {
  const d = await gql(`query($cursor:String){
    products(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges { node {
        id handle
        options {
          id name
          linkedMetafield { namespace key }
          optionValues { id name linkedMetafieldValue }
        }
      } }
    }
  }`, { cursor });
  for (const e of d.products.edges) all.push(e.node);
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}

const MUT = `mutation($productId:ID!, $option:OptionUpdateInput!, $optionValuesToUpdate:[OptionValueUpdateInput!]) {
  productOptionUpdate(productId: $productId, option: $option, optionValuesToUpdate: $optionValuesToUpdate) {
    userErrors { field message code }
    product { id options { name optionValues { name linkedMetafieldValue } } }
  }
}`;

const log = [];
const unmappedColors = new Set();

for (const p of all) {
  for (const opt of p.options) {
    const isColor = /color|colour|لون/i.test(opt.name);
    const isSize = /^size$/i.test(opt.name);
    if (!isColor && !isSize) continue;
    const alreadyLinked = opt.linkedMetafield?.namespace === "shopify";
    if (alreadyLinked) continue;

    const valuesToUpdate = [];
    for (const v of opt.optionValues) {
      const gid = isColor ? matchColor(v.name) : matchSize(v.name);
      if (!gid) {
        if (isColor) unmappedColors.add(v.name);
        continue;
      }
      valuesToUpdate.push({ id: v.id, linkedMetafieldValue: gid });
    }
    if (valuesToUpdate.length === 0) {
      log.push({ handle: p.handle, option: opt.name, status: "SKIPPED_NO_MAPPABLE_VALUES", values: opt.optionValues.map((v) => v.name) });
      continue;
    }
    if (valuesToUpdate.length !== opt.optionValues.length) {
      log.push({ handle: p.handle, option: opt.name, status: "PARTIAL_MAP", mapped: valuesToUpdate.length, total: opt.optionValues.length });
    }

    const input = {
      productId: p.id,
      option: {
        id: opt.id,
        linkedMetafield: {
          namespace: "shopify",
          key: isColor ? "color-pattern" : "size",
        },
      },
      optionValuesToUpdate: valuesToUpdate.map((v) => ({ id: v.id, linkedMetafieldValue: v.linkedMetafieldValue })),
    };

    if (DRY_RUN) {
      log.push({ handle: p.handle, option: opt.name, status: "DRY_RUN", input });
      process.stderr.write(`[dry] ${p.handle} ${opt.name}: ${valuesToUpdate.length}/${opt.optionValues.length} values\n`);
      continue;
    }
    const res = await gql(MUT, input);
    if (res.productOptionUpdate.userErrors.length) {
      log.push({ handle: p.handle, option: opt.name, status: "ERROR", errors: res.productOptionUpdate.userErrors });
      process.stderr.write(`✗ ${p.handle} ${opt.name}: ${JSON.stringify(res.productOptionUpdate.userErrors)}\n`);
    } else {
      log.push({ handle: p.handle, option: opt.name, status: "LINKED", count: valuesToUpdate.length });
      process.stderr.write(`✓ ${p.handle} ${opt.name}: linked ${valuesToUpdate.length} values\n`);
    }
  }
}

writeFileSync(resolve(__dirname, "..", "link-options-to-taxonomy.log.json"), JSON.stringify({ log, unmappedColors: [...unmappedColors] }, null, 2));
console.log("\nSummary:");
console.log(`  Linked: ${log.filter((l) => l.status === "LINKED").length}`);
console.log(`  Errors: ${log.filter((l) => l.status === "ERROR").length}`);
console.log(`  Skipped (no mappable values): ${log.filter((l) => l.status === "SKIPPED_NO_MAPPABLE_VALUES").length}`);
console.log(`  Partial maps: ${log.filter((l) => l.status === "PARTIAL_MAP").length}`);
if (unmappedColors.size) {
  console.log(`\nUnmapped color values (${unmappedColors.size}):`);
  console.log("  " + [...unmappedColors].sort().join(", "));
}
