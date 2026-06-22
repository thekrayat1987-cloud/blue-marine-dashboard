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
const CODE = 'A172';
const TITLE = `${CODE} – Joud Bisht & Pants 2-Piece Set`;
const TITLE_AR = `${CODE} – طقم جود بشت وبنطلون (قطعتين)`;
const PRICE = '25.000';
const TYPE = 'Bisht Pant Set';
const CATEGORY_GID = 'gid://shopify/TaxonomyCategory/aa-1-23'; // Traditional & Ceremonial Clothing
const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
const LENGTHS = [50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60];
const AR_OPT = { 'Size': 'المقاس', 'Length in inch': 'الطول بالإنش' };

const BODY_HTML =
  '<p>The Joud two-piece set pairs a flowing open bisht with matching wide-leg trousers, both in a deep navy paisley (boteh) print with rust-red teardrop motifs and ornate border bands.</p>' +
  '<p>Contrasting black geometric panels on the wide kimono sleeves add depth, while the lightweight, fluid fabric drapes beautifully and moves with you.</p>' +
  '<p>Layer the open bisht over the high-rise, elasticated wide-leg pants for a striking, put-together look — perfect for gatherings, evenings out, and special occasions. Simply add your favourite top underneath.</p>' +
  '<p><strong>Set includes 2 pieces:</strong> the open bisht and the wide-leg pants. Inner top not included.</p>';

const BODY_HTML_AR =
  '<p>طقم جود المكوّن من قطعتين يجمع بين بشت مفتوح انسيابي وبنطلون واسع منسّق، كلاهما بنقشة البيزلي (البوتيه) بلونٍ كحلي غامق مع زخارف على شكل قطرات بلون الأحمر الصدئي وحواشٍ مزخرفة.</p>' +
  '<p>تضيف الألواح الهندسية السوداء المتباينة على الأكمام الواسعة عمقاً للتصميم، بينما ينساب القماش الخفيف بجمالٍ ويتحرّك معكِ.</p>' +
  '<p>ارتدي البشت المفتوح فوق البنطلون الواسع ذي الخصر المطاطي المريح لإطلالةٍ لافتة ومتناسقة — مثالي للتجمعات والسهرات والمناسبات الخاصة. ما عليكِ سوى إضافة بلوزتك المفضّلة تحته.</p>' +
  '<p><strong>الطقم يشمل قطعتين:</strong> البشت المفتوح والبنطلون الواسع. البلوزة الداخلية غير مشمولة.</p>';

const TAGS = [
  '2-piece', 'bisht', 'bisht-pant-set', 'pant', 'pants', 'wide-leg', 'printed', 'patterned', 'paisley',
  'boteh', 'bordered', 'navy', 'blue', 'indigo', 'rust', 'red', 'terracotta', 'black',
  'gulf', 'heritage', 'khaleeji', 'kuwait', 'luxury', 'set', 'evening', 'special-occasion',
  'بشت', 'بنطلون', 'طقم', 'طقم-بشت', 'قطعتين', 'مطبوع', 'منقوش', 'بيزلي', 'كحلي', 'أحمر', 'صدئي',
  'خليجي', 'الكويت', 'فاخر', 'سهرة', 'مناسبة-خاصة', 'واسع',
].join(', ');

const SEO_TITLE = 'Joud Bisht & Pants Set – Navy Rust Paisley | Atelier Blue Marine';
const SEO_DESC = 'Flowing 2-piece set: open bisht + matching wide-leg pants in a navy paisley print with rust teardrop motifs. Sizes XS–3XL. Atelier Blue Marine, Kuwait.';
const SEO_TITLE_AR = 'طقم جود بشت وبنطلون – كحلي بنقشة بيزلي صدئية | أتيليه بلو مارين';
const SEO_DESC_AR = 'طقم انسيابي من قطعتين: بشت مفتوح وبنطلون واسع منسّق بنقشة بيزلي كحلية مع زخارف صدئية. مقاسات XS–3XL. أتيليه بلو مارين، الكويت.';

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

// ---------- 5. Arabic translations: title, body, SEO meta, option names ----------
const gid = `gid://shopify/Product/${created.id}`;
const tc = await gql(`query($id:ID!){ translatableResource(resourceId:$id){ translatableContent{ key digest } } }`, { id: gid });
const dg = Object.fromEntries(tc.translatableResource.translatableContent.map((c) => [c.key, c.digest]));
const want = { title: TITLE_AR, body_html: BODY_HTML_AR, meta_title: SEO_TITLE_AR, meta_description: SEO_DESC_AR };
const t = Object.entries(want).filter(([k]) => dg[k]).map(([k, v]) => ({ key: k, value: v, locale: 'ar', translatableContentDigest: dg[k] }));
const reg = await gql(`mutation($id:ID!,$t:[TranslationInput!]!){ translationsRegister(resourceId:$id, translations:$t){ userErrors{ message } translations{ key } } }`, { id: gid, t });
console.log(reg.translationsRegister.userErrors.length ? `AR err: ${JSON.stringify(reg.translationsRegister.userErrors)}` : `✓ Arabic (product): ${reg.translationsRegister.translations.map((x) => x.key).join(', ')}`);

// option names
const od = await gql(`{ product(id:"${gid}"){ options{ id name } } }`);
for (const o of od.product.options) {
  const ar = AR_OPT[o.name]; if (!ar) continue;
  const otc = await gql(`{ translatableResource(resourceId:"${o.id}"){ translatableContent{ key digest } } }`);
  const d = otc.translatableResource.translatableContent.find((c) => c.key === 'name');
  await gql(`mutation($id:ID!,$t:[TranslationInput!]!){ translationsRegister(resourceId:$id,translations:$t){ userErrors{ message } } }`,
    { id: o.id, t: [{ key: 'name', value: ar, locale: 'ar', translatableContentDigest: d.digest }] });
  console.log(`✓ Arabic option: "${o.name}" → ${ar}`);
  await sleep(120);
}

console.log(`\nDONE (DRAFT, fully localized). Admin: https://${STORE}/admin/products/${created.id}`);
