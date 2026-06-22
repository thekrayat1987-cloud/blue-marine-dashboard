import fs from 'node:fs';
const env = Object.fromEntries(
  fs.readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const STORE = env.SHOPIFY_STORE_URL, TOKEN = env.SHOPIFY_ACCESS_TOKEN, VER = env.SHOPIFY_API_VERSION || '2024-10';
const base = `https://${STORE}/admin/api/${VER}`;
const headers = { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' };
const gidP = 'gid://shopify/Product/10238019305772';
async function gql(q, v) { const r = await fetch(`${base}/graphql.json`, { method: 'POST', headers, body: JSON.stringify({ query: q, variables: v }) }); const j = await r.json(); if (j.errors) throw new Error(JSON.stringify(j.errors)); return j.data; }

let after = null, V = [];
do {
  const d = await gql(`query($id:ID!,$a:String){ product(id:$id){ variants(first:100,after:$a){ pageInfo{hasNextPage endCursor} nodes{ id sku price inventoryQuantity inventoryPolicy selectedOptions{name value} image{id} } } } }`, { id: gidP, a: after });
  V.push(...d.product.variants.nodes);
  after = d.product.variants.pageInfo.hasNextPage ? d.product.variants.pageInfo.endCursor : null;
} while (after);

console.log('TOTAL VARIANTS:', V.length);
const col = (v) => v.selectedOptions.find((s) => s.name === 'Color')?.value;
const colors = [...new Set(V.map(col))];
const skuSeen = {};
console.log('\nPER-COLOR:');
for (const c of colors) {
  const vs = V.filter((v) => col(v) === c);
  const qty = vs.reduce((a, v) => a + (v.inventoryQuantity || 0), 0);
  const oos = vs.filter((v) => (v.inventoryQuantity || 0) <= 0).length;
  const skuTokens = [...new Set(vs.map((v) => (/^A74-([A-Z_]+)-/.exec(v.sku || '') || [])[1]).filter(Boolean))];
  const prices = [...new Set(vs.map((v) => v.price))];
  const cont = vs.filter((v) => v.inventoryPolicy === 'CONTINUE').length;
  const noImg = vs.filter((v) => !v.image).length;
  const imgs = [...new Set(vs.map((v) => v.image?.id).filter(Boolean))];
  console.log(`  ${c.padEnd(9)} variants=${vs.length} stock=${qty} oos=${oos} skuToken=[${skuTokens.join('|')}] price=[${prices.join(',')}] continue=${cont} noImage=${noImg} distinctImgs=${imgs.length}`);
  for (const v of vs) skuSeen[v.sku] = (skuSeen[v.sku] || 0) + 1;
}
const dups = Object.entries(skuSeen).filter(([s, n]) => n > 1 && s);
console.log('\nDUPLICATE SKUs across all colors:', dups.length ? dups.map(([s, n]) => `${s}×${n}`).join(', ') : 'none');
const blankSku = V.filter((v) => !v.sku).length;
console.log('blank SKUs:', blankSku);
const totalStock = V.reduce((a, v) => a + (v.inventoryQuantity || 0), 0);
const totalOOS = V.filter((v) => (v.inventoryQuantity || 0) <= 0).length;
console.log('TOTAL stock units:', totalStock, '| OOS variants:', totalOOS, '/', V.length);
