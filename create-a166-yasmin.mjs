import fs from 'node:fs';
const env = Object.fromEntries(
  fs.readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const STORE = env.SHOPIFY_STORE_URL, TOKEN = env.SHOPIFY_ACCESS_TOKEN, VER = env.SHOPIFY_API_VERSION || '2024-10';
const APPLY = process.argv.includes('--apply');
const base = `https://${STORE}/admin/api/${VER}`;
const headers = { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' };
async function rest(p, o = {}) { const r = await fetch(base + p, { ...o, headers }); if (!r.ok) throw new Error(`REST ${r.status} ${o.method || 'GET'} ${p}: ${await r.text()}`); return r.json(); }
async function gql(q, v = {}) { const r = await fetch(`${base}/graphql.json`, { method: 'POST', headers, body: JSON.stringify({ query: q, variables: v }) }); const j = await r.json(); if (j.errors) throw new Error('GQL: ' + JSON.stringify(j.errors)); return j.data; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- product definition ----------
const CODE = 'A166';
const TITLE = `${CODE} – Yasmin Bisht & Pants 2-Piece Set`;
const TITLE_AR = `${CODE} – طقم ياسمين بشت وبنطلون (قطعتين)`;
const PRICE = '25.000';
const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
const LENGTHS = [50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60];

const BODY_HTML =
  '<p>The Yasmin two-piece set pairs a softly draping open bisht with matching wide-leg trousers, designed to move with you.</p>' +
  '<p>Cut from lightweight, breathable cotton in deep emerald green and finished with an ivory block-print pattern, the set stays cool and easy in the heat while keeping a refined, put-together look.</p>' +
  '<p>The relaxed bisht falls open over the comfortable elasticated wide-leg pants — effortless for summer gatherings, daytime visits, or travel. Simply add your favourite top underneath and go.</p>' +
  '<p><strong>Set includes 2 pieces:</strong> the open bisht and the wide-leg pants. Inner top not included.</p>';

const BODY_HTML_AR =
  '<p>طقم ياسمين المكوّن من قطعتين يجمع بين بشت مفتوح بانسدالٍ ناعم وبنطلون واسع منسّق، مصمّم ليمنحكِ حرية الحركة.</p>' +
  '<p>مصنوع من قطن خفيف ومسامي بلون أخضر زمرّدي غامق مع نقشة مطبوعة بلون عاجي، يمنحكِ إحساساً منعشاً في أجواء الصيف مع إطلالة أنيقة ومتناسقة.</p>' +
  '<p>ينسدل البشت المفتوح بسهولة فوق البنطلون الواسع ذي الخصر المطاطي المريح — مثالي لتجمعات الصيف والزيارات النهارية والسفر. ما عليكِ سوى إضافة بلوزتك المفضّلة تحته.</p>' +
  '<p><strong>الطقم يشمل قطعتين:</strong> البشت المفتوح والبنطلون الواسع. البلوزة الداخلية غير مشمولة.</p>';

const TAGS = [
  '2-piece', 'bisht', 'bisht-set', 'bisht-pant-set', 'pant', 'pants', 'wide-leg', 'cotton', 'summer',
  'lightweight', 'printed', 'patterned', 'block-print', 'green', 'emerald', 'teal', 'gulf', 'heritage',
  'khaleeji', 'kuwait', 'luxury', 'set', 'casual', 'daytime',
  'بشت', 'بنطلون', 'طقم', 'طقم-بشت', 'قطعتين', 'قطن', 'صيفي', 'خفيف', 'أخضر', 'زمردي', 'مطبوع', 'منقوش',
  'خليجي', 'الكويت', 'فاخر', 'واسع',
].join(', ');

const SEO_TITLE = 'Yasmin Cotton Bisht & Pants Set – Emerald Green | Atelier Blue Marine';
const SEO_DESC = 'Lightweight cotton 2-piece set: open bisht + wide-leg pants in emerald-green block print. Breathable summer wear, sizes XS–3XL. Shop Atelier Blue Marine, Kuwait.';

// ---------- preflight ----------
console.log(`Mode: ${APPLY ? 'APPLY' : 'CHECK (dry-run)'}  Store: ${STORE}  API: ${VER}`);
const all = await rest('/products.json?limit=250&fields=id,title');
if (all.products.some((x) => x.title.startsWith(CODE))) {
  console.log(`A product starting with "${CODE}" already exists — aborting to avoid a duplicate.`);
  process.exit(1);
}
// template product A164 (for metafield types/values to replicate)
const a164 = all.products.find((x) => x.title.startsWith('A164'));
const { metafields: srcMeta } = await rest(`/products/${a164.id}/metafields.json`);

// build variants: Size x Length = 77 (complete grid, under 100 cap)
const variants = [];
for (const s of SIZES) for (const L of LENGTHS) {
  variants.push({ option1: s, option2: String(L), price: PRICE, sku: `${CODE}-${s}-${L}`,
    inventory_management: 'shopify', inventory_policy: 'deny', weight: 1, weight_unit: 'kg', taxable: true });
}

console.log(`Title:    ${TITLE}`);
console.log(`Price:    ${PRICE} KWD   Variants: ${variants.length} (Size ${SIZES.length} × Length ${LENGTHS.length})`);
console.log(`Tags:     ${TAGS.split(', ').length} tags incl. "bisht-pant-set"  →  auto-joins the collection`);
console.log(`Metafields to replicate from A164 (excl. judgeme): ${srcMeta.filter((m) => m.namespace !== 'judgeme').length}`);

if (!APPLY) {
  console.log('\nDry-run only. Re-run with --apply to create the DRAFT product.');
  process.exit(0);
}

// ---------- create product (draft) ----------
const productPayload = {
  product: {
    title: TITLE, body_html: BODY_HTML, vendor: 'Atelier Blue Marine',
    product_type: 'Bisht Set', status: 'draft', tags: TAGS, template_suffix: 'custom',
    options: [{ name: 'Size', values: SIZES }, { name: 'Length in inch', values: LENGTHS.map(String) }],
    variants,
  },
};
const created = (await rest('/products.json', { method: 'POST', body: JSON.stringify(productPayload) })).product;
console.log(`\n✓ Created DRAFT product id ${created.id} (handle: ${created.handle}) with ${created.variants.length} variants`);

// ---------- replicate metafields from A164 ----------
const overrides = {
  'global.title_tag': SEO_TITLE,
  'global.description_tag': SEO_DESC,
  'mm-google-shopping.mpn': CODE,
};
let okMeta = 0, failMeta = 0;
for (const m of srcMeta) {
  if (m.namespace === 'judgeme') continue; // app-managed, product-specific
  const value = overrides[`${m.namespace}.${m.key}`] ?? m.value;
  try {
    await rest(`/products/${created.id}/metafields.json`, {
      method: 'POST',
      body: JSON.stringify({ metafield: { namespace: m.namespace, key: m.key, value, type: m.type } }),
    });
    okMeta++;
  } catch (e) { failMeta++; console.log(`  metafield ${m.namespace}.${m.key} skipped: ${String(e.message).slice(0, 90)}`); }
  await sleep(120);
}
console.log(`✓ Metafields set: ${okMeta} ok, ${failMeta} skipped`);

// ---------- inventory: 5 at primary location for every variant ----------
const { locations } = await rest('/locations.json');
const loc = locations.find((l) => l.active) || locations[0];
let invOk = 0;
for (const v of created.variants) {
  try {
    await rest('/inventory_levels/set.json', {
      method: 'POST',
      body: JSON.stringify({ location_id: loc.id, inventory_item_id: v.inventory_item_id, available: 5 }),
    });
    invOk++;
  } catch (e) { console.log(`  inv ${v.sku}: ${String(e.message).slice(0, 80)}`); }
  await sleep(90);
}
console.log(`✓ Inventory set to 5 at "${loc.name}" for ${invOk}/${created.variants.length} variants`);

// ---------- Arabic translations (title + body_html) ----------
const gid = `gid://shopify/Product/${created.id}`;
const tc = await gql(`query($id:ID!){ translatableResource(resourceId:$id){ translatableContent{ key digest } } }`, { id: gid });
const want = { title: TITLE_AR, body_html: BODY_HTML_AR };
const translations = tc.translatableResource.translatableContent
  .filter((c) => want[c.key] != null)
  .map((c) => ({ key: c.key, value: want[c.key], locale: 'ar', translatableContentDigest: c.digest }));
const reg = await gql(
  `mutation($id:ID!,$t:[TranslationInput!]!){ translationsRegister(resourceId:$id, translations:$t){ userErrors{ message } translations{ key } } }`,
  { id: gid, t: translations });
const terrs = reg.translationsRegister.userErrors;
console.log(terrs.length ? `AR errors: ${JSON.stringify(terrs)}` : `✓ Arabic registered: ${reg.translationsRegister.translations.map((x) => x.key).join(', ')}`);

console.log(`\nDONE (status: DRAFT — add the 2 photos, then set Active).`);
console.log(`Admin: https://${STORE}/admin/products/${created.id}`);
