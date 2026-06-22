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
const CODE = 'A169';
const TITLE = `${CODE} – Layan Bisht & Pants 2-Piece Set`;
const TITLE_AR = `${CODE} – طقم ليان بشت وبنطلون (قطعتين)`;
const PRICE = '25.000';
const TYPE = 'Bisht Pant Set';
const CATEGORY_GID = 'gid://shopify/TaxonomyCategory/aa-1-23'; // Traditional & Ceremonial Clothing
const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
const LENGTHS = [50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60];

const BODY_HTML =
  '<p>The Layan two-piece set pairs a softly draping open bisht with matching wide-leg trousers, both in a deep indigo-blue block print with cream batik-style florals and bold circular medallion motifs.</p>' +
  '<p>Cut from lightweight, breathable cotton, the set stays cool and easy in the heat while keeping a refined, artisanal look. The wide kimono sleeves and flowing leg add effortless movement.</p>' +
  '<p>Layer the open bisht over the high-rise, elasticated wide-leg pants for a relaxed yet put-together look — perfect for summer gatherings, daytime visits, or travel. Simply add your favourite top underneath.</p>' +
  '<p><strong>Set includes 2 pieces:</strong> the open bisht and the wide-leg pants. Inner top not included.</p>';

const BODY_HTML_AR =
  '<p>طقم ليان المكوّن من قطعتين يجمع بين بشت مفتوح بانسدالٍ ناعم وبنطلون واسع منسّق، كلاهما بنقشةٍ مطبوعة بلون النيلي الأزرق الغامق مع زهور بأسلوب الباتيك بلون كريمي وزخارف دائرية لافتة.</p>' +
  '<p>مصنوع من قطن خفيف ومسامي، يمنحكِ إحساساً منعشاً في أجواء الصيف مع إطلالةٍ أنيقة وحرفية. تضيف الأكمام الواسعة على طراز الكيمونو والساق الواسعة حركةً انسيابية.</p>' +
  '<p>ارتدي البشت المفتوح فوق البنطلون الواسع ذي الخصر المطاطي المريح لإطلالةٍ مريحة ومتناسقة — مثالي لتجمعات الصيف والزيارات النهارية والسفر. ما عليكِ سوى إضافة بلوزتك المفضّلة تحته.</p>' +
  '<p><strong>الطقم يشمل قطعتين:</strong> البشت المفتوح والبنطلون الواسع. البلوزة الداخلية غير مشمولة.</p>';

const TAGS = [
  '2-piece', 'bisht', 'bisht-pant-set', 'pant', 'pants', 'wide-leg', 'cotton', 'summer', 'lightweight',
  'printed', 'patterned', 'block-print', 'batik', 'blue', 'navy', 'indigo', 'cream',
  'gulf', 'heritage', 'khaleeji', 'kuwait', 'luxury', 'set', 'casual', 'daytime',
  'بشت', 'بنطلون', 'طقم', 'طقم-بشت', 'قطعتين', 'قطن', 'صيفي', 'خفيف', 'أزرق', 'كحلي', 'نيلي',
  'مطبوع', 'منقوش', 'خليجي', 'الكويت', 'فاخر', 'واسع',
].join(', ');

const SEO_TITLE = 'Layan Cotton Bisht & Pants Set – Indigo Block Print | Atelier Blue Marine';
const SEO_DESC = 'Lightweight cotton 2-piece set: open bisht + wide-leg pants in indigo-blue block print with cream batik florals. Breathable summer wear, sizes XS–3XL. Atelier Blue Marine, Kuwait.';

// ---------- preflight ----------
console.log(`Mode: ${APPLY ? 'APPLY' : 'CHECK (dry-run)'}  Store: ${STORE}`);
const all = await rest('/products.json?limit=250&fields=id,title');
if (all.products.some((x) => x.title.startsWith(CODE))) { console.log(`"${CODE}" already exists — aborting.`); process.exit(1); }
const a164 = all.products.find((x) => x.title.startsWith('A164'));
const { metafields: srcMeta } = await rest(`/products/${a164.id}/metafields.json`);

const variants = [];
for (const s of SIZES) for (const L of LENGTHS) {
  variants.push({ option1: s, option2: String(L), price: PRICE, sku: `${CODE}-${s}-${L}`,
    inventory_management: 'shopify', inventory_policy: 'deny', weight: 1, weight_unit: 'kg', taxable: true });
}
console.log(`Title: ${TITLE}\nType: ${TYPE}  Price: ${PRICE} KWD  Variants: ${variants.length}  Tags: ${TAGS.split(', ').length} (incl. bisht-pant-set)`);
console.log(`Metafields to replicate (excl. judgeme): ${srcMeta.filter((m) => m.namespace !== 'judgeme').length}`);
if (!APPLY) { console.log('\nDry-run only. Re-run with --apply.'); process.exit(0); }

// ---------- 1. create product (draft) ----------
const created = (await rest('/products.json', { method: 'POST', body: JSON.stringify({ product: {
  title: TITLE, body_html: BODY_HTML, vendor: 'Atelier Blue Marine', product_type: TYPE,
  status: 'draft', tags: TAGS, template_suffix: 'custom',
  options: [{ name: 'Size', values: SIZES }, { name: 'Length in inch', values: LENGTHS.map(String) }], variants,
} }) })).product;
console.log(`\n✓ Created DRAFT id ${created.id} (handle ${created.handle}) with ${created.variants.length} variants`);

// ---------- 2. set category ----------
const cu = await gql(`mutation($p:ProductInput!){ productUpdate(input:$p){ product{ category{ name } } userErrors{ message } } }`,
  { p: { id: `gid://shopify/Product/${created.id}`, category: CATEGORY_GID } });
console.log(cu.productUpdate.userErrors.length ? `category err: ${JSON.stringify(cu.productUpdate.userErrors)}` : `✓ Category: ${cu.productUpdate.product.category?.name}`);
await sleep(1500);

// ---------- 3. replicate metafields ----------
const overrides = { 'global.title_tag': SEO_TITLE, 'global.description_tag': SEO_DESC, 'mm-google-shopping.mpn': CODE };
let ok = 0, fail = 0;
for (const m of srcMeta) {
  if (m.namespace === 'judgeme') continue;
  const value = overrides[`${m.namespace}.${m.key}`] ?? m.value;
  try { await rest(`/products/${created.id}/metafields.json`, { method: 'POST', body: JSON.stringify({ metafield: { namespace: m.namespace, key: m.key, value, type: m.type } }) }); ok++; }
  catch (e) { fail++; console.log(`  ✗ ${m.namespace}.${m.key}: ${String(e.message).slice(0, 80)}`); }
  await sleep(120);
}
console.log(`✓ Metafields: ${ok} ok, ${fail} failed`);

// ---------- 4. inventory 5 at primary location ----------
const { locations } = await rest('/locations.json');
const loc = locations.find((l) => l.active) || locations[0];
let inv = 0;
for (const v of created.variants) {
  try { await rest('/inventory_levels/set.json', { method: 'POST', body: JSON.stringify({ location_id: loc.id, inventory_item_id: v.inventory_item_id, available: 5 }) }); inv++; } catch {}
  await sleep(90);
}
console.log(`✓ Inventory 5 at "${loc.name}": ${inv}/${created.variants.length}`);

// ---------- 5. Arabic translations ----------
const gid = `gid://shopify/Product/${created.id}`;
const tc = await gql(`query($id:ID!){ translatableResource(resourceId:$id){ translatableContent{ key digest } } }`, { id: gid });
const want = { title: TITLE_AR, body_html: BODY_HTML_AR };
const t = tc.translatableResource.translatableContent.filter((c) => want[c.key] != null).map((c) => ({ key: c.key, value: want[c.key], locale: 'ar', translatableContentDigest: c.digest }));
const reg = await gql(`mutation($id:ID!,$t:[TranslationInput!]!){ translationsRegister(resourceId:$id, translations:$t){ userErrors{ message } translations{ key } } }`, { id: gid, t });
console.log(reg.translationsRegister.userErrors.length ? `AR err: ${JSON.stringify(reg.translationsRegister.userErrors)}` : `✓ Arabic: ${reg.translationsRegister.translations.map((x) => x.key).join(', ')}`);

// ---------- 5b. Arabic option NAMES (Size/Length) — matches A161–A165 ----------
const OPTION_NAME_AR = { 'Size': 'المقاس', 'Length in inch': 'الطول بالإنش' };
const od = await gql(`query($id:ID!){ product(id:$id){ options{ id name } } }`, { id: gid });
for (const o of od.product.options) {
  const ar = OPTION_NAME_AR[o.name];
  if (!ar) continue;
  const ores = await gql(`query($id:ID!){ translatableResource(resourceId:$id){ translatableContent{ key digest } } }`, { id: o.id });
  const digest = ores.translatableResource.translatableContent.find((c) => c.key === 'name')?.digest;
  const r = await gql(`mutation($id:ID!,$t:[TranslationInput!]!){ translationsRegister(resourceId:$id, translations:$t){ userErrors{ message } } }`,
    { id: o.id, t: [{ key: 'name', value: ar, locale: 'ar', translatableContentDigest: digest }] });
  console.log(r.translationsRegister.userErrors.length ? `  opt AR err (${o.name}): ${JSON.stringify(r.translationsRegister.userErrors)}` : `✓ option "${o.name}" -> ${ar}`);
  await sleep(120);
}

console.log(`\nDONE (DRAFT). Admin: https://${STORE}/admin/products/${created.id}`);
