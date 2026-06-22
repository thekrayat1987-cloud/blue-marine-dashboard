import fs from 'node:fs';
const env = Object.fromEntries(
  fs.readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const STORE = env.SHOPIFY_STORE_URL, TOKEN = env.SHOPIFY_ACCESS_TOKEN, VER = env.SHOPIFY_API_VERSION || '2024-10';
const gql = async (query, variables = {}) => {
  const r = await fetch(`https://${STORE}/admin/api/${VER}/graphql.json`, {
    method: 'POST', headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }) });
  const j = await r.json(); if (j.errors) throw new Error(JSON.stringify(j.errors, null, 2)); return j.data;
};

const LOCALE = 'ar';
// Match the Arabic option names used on the older bisht products (A161–A165).
const NAME_AR = { 'Size': 'المقاس', 'Length in inch': 'الطول بالإنش' };
const codes = ['A166', 'A167', 'A168', 'A169'];

const getResource = async (id) => (await gql(`query($id:ID!){ translatableResource(resourceId:$id){
  translatableContent{ key digest } translations(locale:"${LOCALE}"){ key value } } }`, { id })).translatableResource;
const register = async (resourceId, key, value, digest) => {
  const d = await gql(`mutation($resourceId:ID!,$translations:[TranslationInput!]!){
    translationsRegister(resourceId:$resourceId, translations:$translations){
      userErrors{ field message } translations{ key value } } }`,
    { resourceId, translations: [{ locale: LOCALE, key, value, translatableContentDigest: digest }] });
  if (d.translationsRegister.userErrors.length) throw new Error(JSON.stringify(d.translationsRegister.userErrors));
};

for (const code of codes) {
  const d = await gql(`query($q:String!){ products(first:1, query:$q){ edges{ node{ id title
    options{ id name } } } } }`, { q: `title:${code}*` });
  const node = d.products.edges[0]?.node;
  if (!node) { console.log(`${code}: NOT FOUND — skip`); continue; }
  console.log(`\n${code}  "${node.title}"`);
  for (const o of node.options) {
    const ar = NAME_AR[o.name];
    if (!ar) { console.log(`   option "${o.name}": no mapping — skip`); continue; }
    const res = await getResource(o.id);
    const digest = res.translatableContent.find((c) => c.key === 'name')?.digest;
    const existing = (res.translations || []).find((t) => t.key === 'name')?.value;
    if (existing === ar) { console.log(`   option "${o.name}" already -> ${existing}`); continue; }
    await register(o.id, 'name', ar, digest);
    console.log(`   option "${o.name}" -> ${ar}  ✓`);
  }
}
console.log('\nDone.');
