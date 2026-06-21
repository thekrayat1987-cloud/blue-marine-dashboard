import fs from 'node:fs';
const env = Object.fromEntries(
  fs.readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const STORE = env.SHOPIFY_STORE_URL, TOKEN = env.SHOPIFY_ACCESS_TOKEN, VER = env.SHOPIFY_API_VERSION || '2024-10';
const base = `https://${STORE}/admin/api/${VER}`;
const headers = { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' };
async function rest(p, o = {}) { const r = await fetch(base + p, { ...o, headers }); if (!r.ok) throw new Error(`REST ${r.status}: ${await r.text()}`); return r.json(); }
async function gql(q, v = {}) { const r = await fetch(`${base}/graphql.json`, { method: 'POST', headers, body: JSON.stringify({ query: q, variables: v }) }); const j = await r.json(); if (j.errors) throw new Error('GQL: ' + JSON.stringify(j.errors)); return j.data; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const A166_ID = '10371649437996';
const all = await rest('/products.json?limit=250&fields=id,title');
const a164 = all.products.find((x) => x.title.startsWith('A164'));

// 1. read A164 category
const cat = await gql(`query($id:ID!){ product(id:$id){ category{ id name } } }`, { id: `gid://shopify/Product/${a164.id}` });
const catId = cat.product.category?.id;
console.log(`A164 category: ${cat.product.category?.name} (${catId})`);

// 2. assign same category to A166
const upd = await gql(
  `mutation($p:ProductInput!){ productUpdate(input:$p){ product{ id category{ name } } userErrors{ field message } } }`,
  { p: { id: `gid://shopify/Product/${A166_ID}`, category: catId } });
if (upd.productUpdate.userErrors.length) { console.log('category error:', JSON.stringify(upd.productUpdate.userErrors)); process.exit(1); }
console.log(`A166 category set: ${upd.productUpdate.product.category?.name}`);
await sleep(500);

// 3. retry the 5 shopify.* taxonomy metafields from A164
const { metafields } = await rest(`/products/${a164.id}/metafields.json`);
const taxo = metafields.filter((m) => m.namespace === 'shopify');
let ok = 0;
for (const m of taxo) {
  try {
    await rest(`/products/${A166_ID}/metafields.json`, {
      method: 'POST', body: JSON.stringify({ metafield: { namespace: m.namespace, key: m.key, value: m.value, type: m.type } }),
    });
    console.log(`  ✓ ${m.namespace}.${m.key}`); ok++;
  } catch (e) { console.log(`  ✗ ${m.namespace}.${m.key}: ${String(e.message).slice(0, 110)}`); }
  await sleep(150);
}
console.log(`\nTaxonomy metafields applied: ${ok}/${taxo.length}`);
