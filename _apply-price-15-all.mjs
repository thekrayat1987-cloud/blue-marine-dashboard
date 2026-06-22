#!/usr/bin/env node
/** Set EVERY variant price to 15.00 KWD for the listed products (full pagination). */
import fs from 'node:fs';
const env = Object.fromEntries(
  fs.readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const STORE = env.SHOPIFY_STORE_URL, TOKEN = env.SHOPIFY_ACCESS_TOKEN, VER = env.SHOPIFY_API_VERSION || '2024-10';
const base = `https://${STORE}/admin/api/${VER}`;
const headers = { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' };
async function gql(q, v = {}) { const r = await fetch(`${base}/graphql.json`, { method: 'POST', headers, body: JSON.stringify({ query: q, variables: v }) }); const j = await r.json(); if (j.errors) throw new Error('GQL: ' + JSON.stringify(j.errors)); return j.data; }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const chunk = (arr, n) => arr.reduce((a, _, i) => (i % n ? a : [...a, arr.slice(i, i + n)]), []);

const NEW_PRICE = '15.00';
const nums = ['147','134','133','132','131','129','128','124','123','122','112','109','107','100','c95','87','84','79','78','73','69'];

const findQ = `query($query:String!){ products(first:5, query:$query){ edges{ node{ id title variants(first:1){ edges{ node{ sku } } } } } } }`;
const varsQ = `query($pid:ID!, $cursor:String){ product(id:$pid){ variants(first:200, after:$cursor){ pageInfo{ hasNextPage endCursor } edges{ node{ id } } } } }`;
const bulkM = `mutation($pid:ID!, $variants:[ProductVariantsBulkInput!]!){ productVariantsBulkUpdate(productId:$pid, variants:$variants){ productVariants{ id } userErrors{ field message } } }`;

for (const num of nums) {
  const sku = /^[a-z]/i.test(num) ? num.toUpperCase() : 'A' + num;
  const d = await gql(findQ, { query: `sku:${sku}` });
  const nodes = d.products.edges.map(e => e.node);
  const prod = nodes.find(p => p.variants.edges.some(v => (v.node.sku || '').toUpperCase().startsWith(sku.toUpperCase()))) || nodes[0];
  if (!prod) { console.log(`#${num} [${sku}] NOT FOUND — skipped`); continue; }

  // paginate ALL variant ids
  let ids = [], cursor = null;
  do {
    const vd = await gql(varsQ, { pid: prod.id, cursor });
    ids.push(...vd.product.variants.edges.map(e => e.node.id));
    cursor = vd.product.variants.pageInfo.hasNextPage ? vd.product.variants.pageInfo.endCursor : null;
    await sleep(150);
  } while (cursor);

  let updated = 0; const errs = [];
  for (const batch of chunk(ids, 100)) {
    const res = await gql(bulkM, { pid: prod.id, variants: batch.map(id => ({ id, price: NEW_PRICE })) });
    const ue = res.productVariantsBulkUpdate.userErrors;
    if (ue.length) errs.push(...ue);
    updated += res.productVariantsBulkUpdate.productVariants.length;
    await sleep(350);
  }
  console.log(`#${num} [${sku}] ${prod.title} — ${updated}/${ids.length} variants -> ${NEW_PRICE}${errs.length ? '  ERRORS: ' + JSON.stringify(errs) : ''}`);
}
console.log('Done.');
