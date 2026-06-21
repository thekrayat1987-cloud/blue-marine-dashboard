import fs from 'node:fs';
const env = Object.fromEntries(
  fs.readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const STORE = env.SHOPIFY_STORE_URL, TOKEN = env.SHOPIFY_ACCESS_TOKEN, VER = env.SHOPIFY_API_VERSION || '2024-10';
const base = `https://${STORE}/admin/api/${VER}`;
const headers = { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' };
async function rest(p, o = {}) { const r = await fetch(base + p, { ...o, headers }); if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); return r.json(); }

// most recent 10 products
const { products } = await rest('/products.json?limit=10&order=created_at desc&fields=id,title,handle,vendor,product_type,tags,status,variants,options');
for (const p of products) {
  const prices = [...new Set(p.variants.map((v) => v.price))];
  const skus = p.variants.map((v) => v.sku).filter(Boolean);
  console.log(`\n• ${p.title}  [${p.status}]`);
  console.log(`  type: ${p.product_type || '—'}   vendor: ${p.vendor || '—'}`);
  console.log(`  options: ${p.options.map((o) => `${o.name}(${o.values.length})`).join(', ')}`);
  console.log(`  price: ${prices.join('/')}   variants: ${p.variants.length}   skus: ${skus.slice(0, 4).join(', ')}${skus.length > 4 ? '…' : ''}`);
  console.log(`  tags: ${p.tags}`);
}
// distinct product types & price band
const all = await rest('/products.json?limit=250&fields=id,product_type,variants');
const types = {};
let min = 1e9, max = 0;
for (const p of all.products) {
  types[p.product_type || '—'] = (types[p.product_type || '—'] || 0) + 1;
  for (const v of p.variants) { const n = parseFloat(v.price); if (n) { min = Math.min(min, n); max = Math.max(max, n); } }
}
console.log('\n=== product_type distribution (first 250) ===');
console.log(Object.entries(types).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join('\n'));
console.log(`\nprice band: ${min} – ${max} ${all.products[0]?.variants[0]?.price ? '' : ''}`);
