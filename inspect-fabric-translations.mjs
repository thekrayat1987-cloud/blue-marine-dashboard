import fs from 'node:fs';
const env = Object.fromEntries(
  fs.readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const STORE = env.SHOPIFY_STORE_URL, TOKEN = env.SHOPIFY_ACCESS_TOKEN, VER = env.SHOPIFY_API_VERSION || '2024-10';
const gql = async (query, variables = {}) => {
  const r = await fetch(`https://${STORE}/admin/api/${VER}/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors, null, 2));
  return j.data;
};

// available locales
const locales = await gql(`{ shopLocales { locale primary published } }`);
console.log('SHOP LOCALES:', JSON.stringify(locales.shopLocales));

const codes = ['A161', 'A162', 'A163', 'A164'];
for (const code of codes) {
  const d = await gql(`query($q:String!){ products(first:1, query:$q){ edges{ node{ id title
    options{ id name optionValues{ id name } } } } } }`, { q: `title:${code}*` });
  const node = d.products.edges[0]?.node;
  if (!node) { console.log(`\n### ${code}: NOT FOUND`); continue; }
  console.log(`\n### ${code} — ${node.title}  (${node.id})`);
  for (const opt of node.options) {
    // option name translation
    const tr = await gql(`query($id:ID!){ translatableResource(resourceId:$id){
      resourceId
      translatableContent{ key value locale }
      translations(locale:"ar"){ key value }
    } }`, { id: opt.id });
    const ar = (tr.translatableResource?.translations || []).filter(t => t.key === 'name');
    console.log(`  OPTION "${opt.name}" (${opt.id})`);
    console.log(`    translatable keys: ${(tr.translatableResource?.translatableContent||[]).map(c=>c.key).join(', ')}`);
    console.log(`    AR name: ${ar.map(t=>t.value).join('') || '(none)'}`);
    for (const ov of opt.optionValues) {
      const tv = await gql(`query($id:ID!){ translatableResource(resourceId:$id){
        translatableContent{ key value }
        translations(locale:"ar"){ key value }
      } }`, { id: ov.id });
      const arv = (tv.translatableResource?.translations || []).map(t => t.value).join('');
      console.log(`      value "${ov.name}" (${ov.id}) -> AR: ${arv || '(none)'}`);
    }
  }
}
