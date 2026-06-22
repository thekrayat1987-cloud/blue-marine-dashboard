#!/usr/bin/env node
/**
 * A165 – give the Yellow/Green/Red colorways SKUs.
 *
 * The store convention for color variants is {CODE}-{COLOR}-{SIZE}-{LENGTH}
 * (e.g. A55-GREEN-XS-50, A65-BLUE-XS-50). A165's Yellow/Green/Red variants
 * (231 of them) currently have NO sku. This assigns:
 *     A165-YELLOW-<SIZE>-<LENGTH>
 *     A165-GREEN-<SIZE>-<LENGTH>
 *     A165-RED-<SIZE>-<LENGTH>
 *
 * Purple keeps its existing A165-<SIZE>-<LENGTH> skus (untouched) — they may
 * already be referenced by orders/feeds, so we don't rename them here.
 *
 *   node fix-a165-color-skus.mjs          # DRY RUN — prints planned skus
 *   node fix-a165-color-skus.mjs --apply  # write to Shopify
 */
import fs from 'node:fs';
const env = Object.fromEntries(
  fs.readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const STORE = env.SHOPIFY_STORE_URL, TOKEN = env.SHOPIFY_ACCESS_TOKEN, VER = env.SHOPIFY_API_VERSION || '2024-10';
const base = `https://${STORE}/admin/api/${VER}`;
const headers = { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' };
const APPLY = process.argv.includes('--apply');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function gql(q, v = {}) { const r = await fetch(`${base}/graphql.json`, { method: 'POST', headers, body: JSON.stringify({ query: q, variables: v }) }); const j = await r.json(); if (j.errors) throw new Error('GQL: ' + JSON.stringify(j.errors)); return j.data; }

const PRODUCT_ID = 'gid://shopify/Product/10367393825068';
console.log(APPLY ? '*** APPLY MODE — writing to Shopify ***' : '— DRY RUN — (pass --apply to write)');

// Load all variants
let after = null, all = [];
do {
  const d = await gql(`query($id:ID!,$after:String){product(id:$id){variants(first:100,after:$after){
    pageInfo{hasNextPage endCursor} edges{node{id sku selectedOptions{name value}}}}}}`, { id: PRODUCT_ID, after });
  const vs = d.product.variants; all.push(...vs.edges.map(e => e.node));
  after = vs.pageInfo.hasNextPage ? vs.pageInfo.endCursor : null;
} while (after);

const opt = (v, n) => v.selectedOptions.find((o) => o.name === n)?.value;
const skuFor = (v) => `A165-${opt(v,'Color').toUpperCase()}-${opt(v,'Size')}-${opt(v,'Length in inch')}`;

// Target: variants whose color is NOT Purple and which currently have no sku
const targets = all.filter((v) => opt(v, 'Color') !== 'Purple' && !v.sku);
console.log(`Total variants: ${all.length} | targets (non-Purple, no sku): ${targets.length}`);

// Build planned updates + collision check
const planned = targets.map((v) => ({ id: v.id, sku: skuFor(v) }));
const existing = new Set(all.filter(v => v.sku).map(v => v.sku));
const dupInternal = planned.map(p => p.sku).filter((s, i, a) => a.indexOf(s) !== i);
const dupExisting = planned.filter(p => existing.has(p.sku));
if (dupInternal.length) { console.error('ABORT: duplicate generated skus:', [...new Set(dupInternal)]); process.exit(1); }
if (dupExisting.length) { console.error('ABORT: generated sku collides with existing:', dupExisting.map(p=>p.sku)); process.exit(1); }

// Show per-color counts + samples
const byColor = {};
for (const v of targets) (byColor[opt(v,'Color')] ??= []).push(v);
for (const [c, vs] of Object.entries(byColor)) {
  console.log(`\n  ${c}: ${vs.length} variants → e.g. ${skuFor(vs[0])} … ${skuFor(vs[vs.length-1])}`);
}

if (!APPLY) { console.log(`\nDRY RUN complete. ${planned.length} skus would be set. Re-run with --apply.`); process.exit(0); }

// Apply in batches via productVariantsBulkUpdate (sku lives on inventoryItem)
let done = 0;
for (let i = 0; i < planned.length; i += 100) {
  const batch = planned.slice(i, i + 100).map((p) => ({ id: p.id, inventoryItem: { sku: p.sku } }));
  const r = await gql(`mutation($pid:ID!,$variants:[ProductVariantsBulkInput!]!){
    productVariantsBulkUpdate(productId:$pid, variants:$variants){
      userErrors{field message}}}`, { pid: PRODUCT_ID, variants: batch });
  const e = r.productVariantsBulkUpdate.userErrors; if (e.length) { console.error('ERR:', e); process.exit(1); }
  done += batch.length; console.log(`  ✓ set ${done}/${planned.length}`); await sleep(400);
}
console.log('\nDONE. Re-run inspect-a165.mjs to confirm all 308 variants now carry skus.');
