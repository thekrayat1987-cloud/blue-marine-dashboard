#!/usr/bin/env node
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
const q = `query($query:String!){ products(first:5, query:$query){ edges{ node{ id title priceRangeV2{ minVariantPrice{amount} maxVariantPrice{amount} } variantsCount{ count } variants(first:1){ edges{ node{ sku } } } } } } }`;
for (const num of nums) {
  const sku = /^[a-z]/i.test(num) ? num.toUpperCase() : 'A' + num;
  const d = await gql(q, { query: `sku:${sku}` });
  const nodes = d.products.edges.map(e=>e.node);
  const p = nodes.find(n => n.variants.edges.some(v=>(v.node.sku||'').toUpperCase().startsWith(sku.toUpperCase()))) || nodes[0];
  if (!p) { console.log(`#${num} [${sku}] NOT FOUND`); continue; }
  const flag = (parseFloat(p.priceRangeV2.maxVariantPrice.amount) > 15) ? '  <-- NOT FULLY 15' : '';
  console.log(`#${num} [${sku}] count:${p.variantsCount.count}  price:${p.priceRangeV2.minVariantPrice.amount}-${p.priceRangeV2.maxVariantPrice.amount}${flag}`);
}
