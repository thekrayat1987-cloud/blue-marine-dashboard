#!/usr/bin/env node
/**
 * Fix A161–A164 (Two-Piece Daraa sets) to match the A165 standard:
 *   1. Inventory  → set EVERY variant to 5 units (currently ~half sit at 0)
 *   2. product_type → "Two-Piece Daraa" (currently empty; store's existing vocab)
 *   3. Arabic    → remove Eid references (EN + AR) on A161/A164, then
 *                  re-register (re-sync) the AR body_html on all 4 with the
 *                  current digest so nothing is left flagged outdated.
 *
 *   node fix-a161-164.mjs          # DRY RUN — no writes, asserts find-strings
 *   node fix-a161-164.mjs --apply  # write to Shopify
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
async function rest(p, o = {}) { const r = await fetch(base + p, { ...o, headers }); if (!r.ok) throw new Error(`REST ${r.status}: ${await r.text()}`); return r.json(); }
async function gql(q, v = {}) { const r = await fetch(`${base}/graphql.json`, { method: 'POST', headers, body: JSON.stringify({ query: q, variables: v }) }); const j = await r.json(); if (j.errors) throw new Error('GQL: ' + JSON.stringify(j.errors)); return j.data; }

const TARGETS = ['A161', 'A162', 'A163', 'A164'];
const PRODUCT_TYPE = 'Two-Piece Daraa';
const TARGET_QTY = 5;

// Exact Eid find/replace pairs (verified against live content before writing).
const EID = {
  A161: {
    en: [[', Eid celebrations, or', ' or']],            // → "family gatherings or special occasions in Kuwait"
    ar: [[' واحتفالات العيد', '']],                      // → "للتجمعات العائلية والمناسبات الخاصة في الكويت"
  },
  A164: {
    en: [['Eid celebrations', 'special occasions']],    // → "formal evenings, weddings, or special occasions in Kuwait"
    ar: [['احتفالات العيد', 'المناسبات الخاصة']],         // → "حفلات الزفاف، أو المناسبات الخاصة في الكويت"
  },
};

function applyEdits(text, edits, label) {
  let out = text;
  for (const [find, repl] of edits) {
    if (!out.includes(find)) throw new Error(`${label}: find-string NOT FOUND → "${find}"`);
    out = out.split(find).join(repl);
  }
  return out;
}

// location
const locData = await gql(`{ locations(first: 5) { edges { node { id name } } } }`);
const location = locData.locations.edges[0].node;
console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'} | Location: ${location.name}\n`);

const all = await rest('/products.json?limit=250&fields=id,title,body_html,product_type');

for (const code of TARGETS) {
  const p = all.products.find((x) => x.title.startsWith(code));
  const gid = `gid://shopify/Product/${p.id}`;
  console.log(`=== ${p.title} ===`);

  // ---- 1. page ALL variants via GraphQL → inventoryItem ids ----
  const variants = [];
  let cursor = null;
  while (true) {
    const d = await gql(`query($id:ID!,$after:String){ product(id:$id){ variants(first:100,after:$after){ pageInfo{hasNextPage endCursor} edges{ node{ id inventoryItem{id} inventoryQuantity } } } } }`, { id: gid, after: cursor });
    const page = d.product.variants;
    for (const e of page.edges) variants.push(e.node);
    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }
  const atZero = variants.filter((v) => v.inventoryQuantity !== TARGET_QTY).length;
  console.log(`  variants: ${variants.length} | not at ${TARGET_QTY}: ${atZero}`);

  // ---- 2. product_type ----
  const enOld = p.body_html;
  const enEdits = EID[code]?.en || [];
  const enNew = enEdits.length ? applyEdits(enOld, enEdits, `${code} EN`) : enOld;
  const enChanged = enNew !== enOld;
  console.log(`  product_type: "${p.product_type}" → "${PRODUCT_TYPE}"${p.product_type === PRODUCT_TYPE ? ' (already)' : ''}`);
  console.log(`  EN Eid removal: ${enChanged ? 'YES' : 'n/a'}`);

  // ---- 3. AR body: current value + (optional) Eid removal ----
  const tr = await gql(`query($id:ID!){ translatableResource(resourceId:$id){ translations(locale:"ar"){ key value } } }`, { id: gid });
  const arOld = (tr.translatableResource.translations.find((t) => t.key === 'body_html') || {}).value || '';
  const arEdits = EID[code]?.ar || [];
  const arNew = arEdits.length ? applyEdits(arOld, arEdits, `${code} AR`) : arOld;
  console.log(`  AR Eid removal: ${arNew !== arOld ? 'YES' : 'n/a'} | AR re-sync: ${arOld ? 'YES' : 'NO AR BODY'}`);

  if (!APPLY) { console.log(''); continue; }

  // ---- WRITE: inventory ----
  for (let i = 0; i < variants.length; i += 100) {
    const slice = variants.slice(i, i + 100);
    const res = await gql(
      `mutation($input:InventorySetQuantitiesInput!){ inventorySetQuantities(input:$input){ userErrors{field message} } }`,
      { input: { name: 'available', reason: 'correction', ignoreCompareQuantity: true, quantities: slice.map((v) => ({ inventoryItemId: v.inventoryItem.id, locationId: location.id, quantity: TARGET_QTY })) } });
    if (res.inventorySetQuantities.userErrors.length) throw new Error('inventory: ' + JSON.stringify(res.inventorySetQuantities.userErrors));
    await sleep(300);
  }
  console.log(`  ✓ inventory set to ${TARGET_QTY} on ${variants.length} variants`);

  // ---- WRITE: product_type (+ EN body if changed) ----
  const input = { id: gid, productType: PRODUCT_TYPE };
  if (enChanged) input.descriptionHtml = enNew;
  const up = await gql(`mutation($product:ProductUpdateInput!){ productUpdate(product:$product){ userErrors{field message} } }`, { product: input });
  if (up.productUpdate.userErrors.length) throw new Error('productUpdate: ' + JSON.stringify(up.productUpdate.userErrors));
  console.log(`  ✓ product_type set${enChanged ? ' + EN Eid removed' : ''}`);
  await sleep(400);

  // ---- WRITE: AR re-register with FRESH digest (after EN change) ----
  if (arOld) {
    const td = await gql(`query($id:ID!){ translatableResource(resourceId:$id){ translatableContent{ key digest } } }`, { id: gid });
    const digest = td.translatableResource.translatableContent.find((c) => c.key === 'body_html')?.digest;
    if (!digest) { console.log('  ✗ AR: no body_html digest'); }
    else {
      const reg = await gql(`mutation($id:ID!,$t:[TranslationInput!]!){ translationsRegister(resourceId:$id,translations:$t){ userErrors{field message} } }`,
        { id: gid, t: [{ locale: 'ar', key: 'body_html', value: arNew, translatableContentDigest: digest }] });
      if (reg.translationsRegister.userErrors.length) throw new Error('AR: ' + JSON.stringify(reg.translationsRegister.userErrors));
      console.log(`  ✓ AR body re-synced${arNew !== arOld ? ' + Eid removed' : ''}`);
    }
  }
  console.log('');
}
console.log(APPLY ? 'DONE.' : '\nDry run complete — re-run with --apply to write.');
