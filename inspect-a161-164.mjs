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

const all = await rest('/products.json?limit=250&fields=id,title,product_type,variants,handle');
const targets = ['A161', 'A162', 'A163', 'A164', 'A165'];
for (const code of targets) {
  const p = all.products.find((x) => x.title.startsWith(code));
  if (!p) { console.log(`${code}: NOT FOUND`); continue; }
  const qtys = p.variants.map((v) => v.inventory_quantity);
  const total = qtys.reduce((a, b) => a + b, 0);
  const distinct = [...new Set(qtys)].sort((a, b) => a - b);
  const tracked = p.variants.filter((v) => v.inventory_management === 'shopify').length;
  console.log(`\n=== ${p.title} (id ${p.id}) ===`);
  console.log(`  product_type: "${p.product_type}"`);
  console.log(`  variants: ${p.variants.length} | tracked(shopify): ${tracked} | total stock: ${total}`);
  console.log(`  distinct qty values: [${distinct.join(', ')}]`);

  // category (GraphQL)
  const cat = await gql(`query($id:ID!){ product(id:$id){ category{ id name } } }`, { id: `gid://shopify/Product/${p.id}` });
  console.log(`  category: ${cat.product.category?.name || '(none)'} (${cat.product.category?.id || '-'})`);

  // translations: title + body_html in Arabic
  const tr = await gql(`query($id:ID!){ translatableResource(resourceId:$id){ translations(locale:"ar"){ key value outdated } translatableContent{ key value } } }`, { id: `gid://shopify/Product/${p.id}` });
  const trs = tr.translatableResource?.translations || [];
  const titleTr = trs.find((t) => t.key === 'title');
  const bodyTr = trs.find((t) => t.key === 'body_html');
  console.log(`  AR title: ${titleTr ? `"${titleTr.value}"${titleTr.outdated ? ' [OUTDATED]' : ''}` : '(missing)'}`);
  console.log(`  AR body : ${bodyTr ? `${bodyTr.value.length} chars${bodyTr.outdated ? ' [OUTDATED]' : ''}` : '(missing)'}`);
}
