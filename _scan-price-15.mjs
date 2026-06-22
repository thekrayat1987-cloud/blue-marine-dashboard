#!/usr/bin/env node
/** Scan all products; bucket by min variant price relative to 15 KWD. Read-only. */
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

const q = `query($cursor:String){
  products(first:100, after:$cursor, query:"status:active"){
    pageInfo{ hasNextPage endCursor }
    edges{ node{ id title productType
      priceRangeV2{ minVariantPrice{ amount } maxVariantPrice{ amount } }
      variants(first:1){ edges{ node{ sku } } }
    } }
  }
}`;

let cursor = null, all = [];
do {
  const d = await gql(q, { cursor });
  for (const e of d.products.edges) {
    const n = e.node;
    all.push({
      title: n.title,
      type: n.productType,
      sku: n.variants.edges[0]?.node.sku || '',
      min: parseFloat(n.priceRangeV2.minVariantPrice.amount),
      max: parseFloat(n.priceRangeV2.maxVariantPrice.amount),
    });
  }
  cursor = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
} while (cursor);

const under = all.filter(p => p.max < 15);          // strictly under 15 (all variants)
const eq = all.filter(p => p.min <= 15 && p.max >= 15 && p.min === p.max && p.max === 15);
const lte = all.filter(p => p.max <= 15);            // 15 and under
console.log(`Total active products: ${all.length}`);
console.log(`Max price < 15 (strictly under): ${under.length}`);
console.log(`Max price <= 15 (15 and under):  ${lte.length}`);
console.log('');
console.log('--- Products with max variant price <= 15 ---');
for (const p of lte.sort((a,b)=>a.max-b.max)) {
  console.log(`${p.sku.padEnd(6)} ${String(p.min===p.max?p.max:p.min+'-'+p.max).padEnd(8)} ${p.type.padEnd(18)} ${p.title}`);
}
