import fs from 'node:fs';

// --- load env ---
const env = Object.fromEntries(
  fs.readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

const STORE = env.SHOPIFY_STORE_URL;
const TOKEN = env.SHOPIFY_ACCESS_TOKEN;
const VER = env.SHOPIFY_API_VERSION || '2024-10';
const APPLY = process.argv.includes('--apply');

const base = `https://${STORE}/admin/api/${VER}`;
const headers = { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' };

async function rest(path, opts = {}) {
  const res = await fetch(base + path, { ...opts, headers });
  if (!res.ok) throw new Error(`REST ${res.status} ${res.statusText}: ${await res.text()}`);
  return res.json();
}
async function gql(query, variables = {}) {
  const res = await fetch(`${base}/graphql.json`, {
    method: 'POST', headers, body: JSON.stringify({ query, variables }),
  });
  const j = await res.json();
  if (j.errors) throw new Error('GraphQL: ' + JSON.stringify(j.errors));
  return j.data;
}

// --- collection definition ---
const TITLE = 'Bisht Pant Sets';
const HANDLE = 'bisht-pant-sets';
const TAG = 'bisht-pant-set';
const BODY_HTML =
  '<p>A summer-ready edit of coordinated bisht sets in breathable, lightweight cotton. ' +
  'Each look pairs a flowing bisht with tailored trousers — choose the 2-piece set (bisht + pant) ' +
  'or the 3-piece set (bisht + blouse + pant). Effortless, elegant, and made for warm-weather days.</p>';

// Arabic translations (Shopify native "Translate & Adapt")
const TITLE_AR = 'أطقم بشت وبنطلون';
const BODY_HTML_AR =
  '<p>تشكيلة صيفية من أطقم البشت المنسّقة بقماش قطني خفيف وناعم. ' +
  'كل إطلالة تجمع بين بشت انسيابي وبنطلون أنيق — اختاري الطقم المكوّن من قطعتين (بشت + بنطلون) ' +
  'أو الطقم المكوّن من ثلاث قطع (بشت + بلوزة + بنطلون). أناقة بلا مجهود، مصمّمة لأيام الصيف الدافئة.</p>';

console.log(`Store: ${STORE}  API: ${VER}  Mode: ${APPLY ? 'APPLY' : 'CHECK (dry-run)'}`);

// 1. verify connection
const { shop } = await rest('/shop.json');
console.log(`Connected: ${shop.name} (${shop.domain})`);

// 2. check for existing smart OR custom collection with this handle/title
const { smart_collections } = await rest('/smart_collections.json?limit=250');
const { custom_collections } = await rest('/custom_collections.json?limit=250');
const existing =
  smart_collections.find((c) => c.handle === HANDLE || c.title === TITLE) ||
  custom_collections.find((c) => c.handle === HANDLE || c.title === TITLE);

if (existing) {
  console.log(`Already exists: "${existing.title}" (id ${existing.id}, handle ${existing.handle}) — will NOT duplicate.`);
}

// 3. how many products already carry the tag
const tagCount = (await gql(
  `query($q:String!){ products(first:1, query:$q){ pageInfo{ hasNextPage } } productsCount: productsCount(query:$q){ count } }`,
  { q: `tag:${TAG}` }
).catch(() => null));
console.log(`Products currently tagged "${TAG}": ${tagCount?.productsCount?.count ?? 'n/a'}`);

if (!APPLY) {
  console.log('\nDry-run only. Re-run with --apply to create the collection.');
  console.log(`Would create SMART collection:
  title:   ${TITLE}
  handle:  ${HANDLE}
  rule:    tag EQUALS "${TAG}"  (automated)
  AR title: ${TITLE_AR}`);
  process.exit(0);
}

if (existing) {
  console.log('Skipping creation (already exists). Nothing to do.');
  process.exit(0);
}

// --- APPLY: create the smart (automated) collection ---
const payload = {
  smart_collection: {
    title: TITLE,
    handle: HANDLE,
    body_html: BODY_HTML,
    disjunctive: false, // ALL conditions must match
    sort_order: 'created-desc',
    rules: [{ column: 'tag', relation: 'equals', condition: TAG }],
    published: true, // publish to Online Store
  },
};
const created = (await rest('/smart_collections.json', {
  method: 'POST', body: JSON.stringify(payload),
})).smart_collection;
console.log(`\nCreated smart collection: "${created.title}" id ${created.id} handle ${created.handle}`);

// --- register Arabic translations via GraphQL ---
const gid = `gid://shopify/Collection/${created.id}`;
// fetch translatable digests for title + body_html
const tc = await gql(
  `query($id:ID!){ translatableResource(resourceId:$id){ translatableContent{ key value digest locale } } }`,
  { id: gid }
);
const contents = tc.translatableResource.translatableContent;
const wanted = { title: TITLE_AR, body_html: BODY_HTML_AR };
const translations = contents
  .filter((c) => wanted[c.key] != null)
  .map((c) => ({ key: c.key, value: wanted[c.key], locale: 'ar', translatableContentDigest: c.digest }));

const reg = await gql(
  `mutation($id:ID!,$t:[TranslationInput!]!){
     translationsRegister(resourceId:$id, translations:$t){
       userErrors{ field message }
       translations{ key locale }
     }
   }`,
  { id: gid, t: translations }
);
const errs = reg.translationsRegister.userErrors;
if (errs.length) console.log('AR translation errors:', JSON.stringify(errs));
else console.log(`Arabic translations registered: ${reg.translationsRegister.translations.map((x) => x.key).join(', ')}`);

console.log(`\nDone. View it: https://${shop.domain}/collections/${created.handle}`);
console.log(`Admin: https://${STORE.replace('.myshopify.com', '')}.myshopify.com/admin/collections/${created.id}`);
