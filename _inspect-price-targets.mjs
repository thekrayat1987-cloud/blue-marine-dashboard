#!/usr/bin/env node
/** Inspect price-change targets: confirm products exist, show current prices. Read-only. */
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

const nums = ['147','134','133','132','131','129','128','124','123','122','112','109','107','100','c95','87','84','79','78','73','69'];

const q = `query($query:String!){
  products(first:10, query:$query){
    edges{ node{
      id legacyResourceId title handle status productType
      variants(first:100){ edges{ node{ id sku price compareAtPrice selectedOptions{ name value } } } }
    } }
  }
}`;

function skuVariants(input) {
  // SKU prefix: letter + number. user numbers map to A<num>; 'c95' -> C95
  if (/^[a-z]/i.test(input)) return [input.toUpperCase()];
  return ['A' + input];
}

for (const n of nums) {
  const candidates = skuVariants(n);
  let found = null, matchedSku = null;
  for (const sku of candidates) {
    const d = await gql(q, { query: `sku:${sku}` });
    const nodes = d.products.edges.map(e => e.node);
    if (nodes.length) {
      // pick the product whose variants actually carry the SKU (exact or prefix)
      const exact = nodes.find(p => p.variants.edges.some(v => (v.node.sku || '').toUpperCase() === sku.toUpperCase()));
      const prefix = nodes.find(p => p.variants.edges.some(v => (v.node.sku || '').toUpperCase().startsWith(sku.toUpperCase())));
      found = exact || prefix || nodes[0];
      matchedSku = sku;
      break;
    }
  }
  if (!found) { console.log(`#${n}  -> NOT FOUND (tried ${candidates.join(', ')})`); continue; }
  const vs = found.variants.edges.map(e => e.node);
  const prices = [...new Set(vs.map(v => v.price))];
  console.log(`#${n}  [${matchedSku}]  ${found.title}  (${found.status}, ${found.productType})  variants:${vs.length}  prices:{${prices.join(', ')}}  handle:${found.handle}`);
}
