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

const LOCALE = 'ar';
const FABRIC_NAME_AR = 'القماش';
const VALUE_AR = { 'Plain': 'سادة', 'Printed': 'مطبوع' };
const codes = ['A161', 'A162', 'A163', 'A164'];

const getResource = async (id) => {
  const d = await gql(`query($id:ID!){ translatableResource(resourceId:$id){
    translatableContent{ key value digest }
    translations(locale:"${LOCALE}"){ key value }
  } }`, { id });
  return d.translatableResource;
};
const register = async (resourceId, key, value, digest) => {
  const d = await gql(`mutation($resourceId:ID!,$translations:[TranslationInput!]!){
    translationsRegister(resourceId:$resourceId, translations:$translations){
      userErrors{ field message } translations{ key value } } }`,
    { resourceId, translations: [{ locale: LOCALE, key, value, translatableContentDigest: digest }] });
  if (d.translationsRegister.userErrors.length) throw new Error(JSON.stringify(d.translationsRegister.userErrors));
};

// Translate the option NAME "Fabric" -> القماش on every product (idempotent),
// and collect the shared taxonomy metaobjects backing Plain/Printed.
const metaobjects = new Map(); // metaobjectGid -> Arabic label
for (const code of codes) {
  const d = await gql(`query($q:String!){ products(first:1, query:$q){ edges{ node{ id title
    options{ id name optionValues{ id name linkedMetafieldValue } } } } } }`, { q: `title:${code}*` });
  const node = d.products.edges[0]?.node;
  if (!node) { console.log(`${code}: NOT FOUND — skip`); continue; }
  const fabric = node.options.find((o) => o.name.toLowerCase() === 'fabric');
  if (!fabric) { console.log(`${code}: no Fabric option — skip`); continue; }

  const res = await getResource(fabric.id);
  const digest = res.translatableContent.find((c) => c.key === 'name')?.digest;
  const existing = (res.translations || []).find((t) => t.key === 'name')?.value;
  if (existing === FABRIC_NAME_AR) console.log(`${code}: option "Fabric" already ${existing}`);
  else { await register(fabric.id, 'name', FABRIC_NAME_AR, digest); console.log(`${code}: option "Fabric" -> ${FABRIC_NAME_AR}  ✓`); }

  for (const ov of fabric.optionValues) {
    const ar = VALUE_AR[ov.name?.trim()];
    if (ar && ov.linkedMetafieldValue) metaobjects.set(ov.linkedMetafieldValue, ar);
  }
}

// Translate the shared fabric taxonomy metaobjects (label) -> Arabic.
// These are global, so each unique metaobject is handled once and fixes all products.
console.log(`\nFabric value metaobjects to translate: ${metaobjects.size}`);
for (const [gid, ar] of metaobjects) {
  const res = await getResource(gid);
  const labelContent = res.translatableContent.find((c) => c.key === 'label');
  if (!labelContent) { console.log(`  ${gid}: no 'label' content — skip`); continue; }
  const existing = (res.translations || []).find((t) => t.key === 'label')?.value;
  if (existing === ar) { console.log(`  ${gid} (${labelContent.value.trim()}): already ${existing}`); continue; }
  await register(gid, 'label', ar, labelContent.digest);
  console.log(`  ${gid} (${labelContent.value.trim()}) -> ${ar}  ✓`);
}
console.log('\nDone.');
