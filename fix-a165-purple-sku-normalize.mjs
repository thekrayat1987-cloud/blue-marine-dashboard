#!/usr/bin/env node
/**
 * A165 – normalize Purple skus to the store convention {CODE}-{COLOR}-{SIZE}-{LENGTH}.
 *   A165-<SIZE>-<LENGTH>  →  A165-PURPLE-<SIZE>-<LENGTH>
 * (Yellow/Green/Red already follow the convention.)
 *
 *   node fix-a165-purple-sku-normalize.mjs          # DRY RUN
 *   node fix-a165-purple-sku-normalize.mjs --apply   # write to Shopify
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

let after = null, all = [];
do {
  const d = await gql(`query($id:ID!,$after:String){product(id:$id){variants(first:100,after:$after){
    pageInfo{hasNextPage endCursor} edges{node{id sku selectedOptions{name value}}}}}}`, { id: PRODUCT_ID, after });
  const vs = d.product.variants; all.push(...vs.edges.map(e => e.node));
  after = vs.pageInfo.hasNextPage ? vs.pageInfo.endCursor : null;
} while (after);

const opt = (v, n) => v.selectedOptions.find((o) => o.name === n)?.value;
const wantSku = (v) => `A165-${opt(v,'Color').toUpperCase()}-${opt(v,'Size')}-${opt(v,'Length in inch')}`;

// Purple variants whose sku isn't yet the normalized form
const purple = all.filter((v) => opt(v, 'Color') === 'Purple');
const planned = purple.filter((v) => v.sku !== wantSku(v)).map((v) => ({ id: v.id, from: v.sku, sku: wantSku(v) }));
console.log(`Purple variants: ${purple.length} | to rename: ${planned.length}`);

// Collision check against ALL other skus
const others = new Set(all.filter(v => opt(v,'Color') !== 'Purple' && v.sku).map(v => v.sku));
const dupInternal = planned.map(p => p.sku).filter((s, i, a) => a.indexOf(s) !== i);
const dupExisting = planned.filter(p => others.has(p.sku));
if (dupInternal.length) { console.error('ABORT: duplicate generated skus:', [...new Set(dupInternal)]); process.exit(1); }
if (dupExisting.length) { console.error('ABORT: collides with existing sku:', dupExisting.map(p=>p.sku)); process.exit(1); }

if (planned.length) console.log(`  e.g. ${planned[0].from} → ${planned[0].sku}   …   ${planned[planned.length-1].from} → ${planned[planned.length-1].sku}`);
if (!APPLY) { console.log(`\nDRY RUN complete. ${planned.length} Purple skus would be renamed. Re-run with --apply.`); process.exit(0); }

let done = 0;
for (let i = 0; i < planned.length; i += 100) {
  const batch = planned.slice(i, i + 100).map((p) => ({ id: p.id, inventoryItem: { sku: p.sku } }));
  const r = await gql(`mutation($pid:ID!,$variants:[ProductVariantsBulkInput!]!){
    productVariantsBulkUpdate(productId:$pid, variants:$variants){ userErrors{field message}}}`,
    { pid: PRODUCT_ID, variants: batch });
  const e = r.productVariantsBulkUpdate.userErrors; if (e.length) { console.error('ERR:', e); process.exit(1); }
  done += batch.length; console.log(`  ✓ renamed ${done}/${planned.length}`); await sleep(400);
}
console.log('\nDONE. All A165 skus now follow A165-<COLOR>-<SIZE>-<LENGTH>.');
