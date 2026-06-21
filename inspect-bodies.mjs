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

const all = await rest('/products.json?limit=250&fields=id,title,body_html,options');
for (const code of ['A164', 'A165']) {
  const p = all.products.find((x) => x.title.startsWith(code));
  console.log(`\n############### ${p.title} ###############`);
  console.log('OPTIONS:', p.options.map((o) => `${o.name}[${o.values.length}]`).join(', '));
  console.log('\n--- EN body_html ---\n' + p.body_html);
  const tr = await gql(`query($id:ID!){ translatableResource(resourceId:$id){ translations(locale:"ar"){ key value outdated } } }`, { id: `gid://shopify/Product/${p.id}` });
  const trs = tr.translatableResource?.translations || [];
  for (const key of ['title', 'body_html', 'product_type']) {
    const t = trs.find((x) => x.key === key);
    console.log(`\n--- AR ${key}${t?.outdated ? ' [OUTDATED]' : ''} ---\n` + (t ? t.value : '(missing)'));
  }
}
