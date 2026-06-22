import fs from 'node:fs';
const env = Object.fromEntries(
  fs.readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const STORE = env.SHOPIFY_STORE_URL, TOKEN = env.SHOPIFY_ACCESS_TOKEN, VER = env.SHOPIFY_API_VERSION || '2024-10';
const base = `https://${STORE}/admin/api/${VER}`;
const headers = { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' };
const APPLY = process.env.APPLY === '1';
const gidP = 'gid://shopify/Product/10238019305772';
async function gql(q, v) { const r = await fetch(`${base}/graphql.json`, { method: 'POST', headers, body: JSON.stringify({ query: q, variables: v }) }); const j = await r.json(); if (j.errors) throw new Error(JSON.stringify(j.errors)); return j.data; }

// ---------- NEW CONTENT ----------
const EN_BODY = `<p>Munia, meaning 'spring' in Arabic, evokes the fresh bloom of a new season. This daraa features a flowing silhouette that drapes elegantly, designed for effortless movement and presence.</p>
<p>Crafted from lightweight, semi-sheer fabric, it is intricately detailed with white bandhani-style circular motifs and delicate leaf patterns. The contrasting cuffs with a zigzag pattern add a modern touch. This piece is atelier-made in Kuwait.</p>
<p>Perfect for formal gatherings, evening events, or Eid celebrations. It pairs naturally with statement earrings and elegant sandals, offering a refined choice for the modern Khaleeji woman.</p>

<!-- gmc-enriched:start -->
<h3>Product details</h3>
<ul>
<li>
<strong>Colors:</strong> Pink, Blue</li>
<li>
<strong>Sizes:</strong> XS – 3XL</li>
<li>
<strong>Material:</strong> Cotton, Silk</li>
<li>
<strong>Pattern:</strong> Printed</li>
</ul>
<!-- gmc-enriched:end -->`;

const EN_SEO_TITLE = 'Munia Daraa | Bandhani Print Gown | Atelier Blue Marine';
const EN_SEO_DESC = 'Munia bandhani daraa in pink or blue, with white circular motifs. Atelier-made in Kuwait, delivered across the Gulf. Ideal for evenings and Eid.';

const AR_BODY = `<p>منية، اسم يوحي بالربيع وانتعاش الموسم الجديد. تتميز هذه الدرّاعة بقصّة انسيابية تنسدل بأناقة، مصممة لحرية الحركة والحضور اللافت.</p>
<p>صُنعت من قماش خفيف شبه شفاف، ومزينة بنقوش دائرية بأسلوب البانداني باللون الأبيض وأنماط أوراق شجر رقيقة. الأكمام المتباينة بنقش متعرج تضيف لمسة عصرية. هذه القطعة صُنعت في أتيليه في الكويت.</p>
<p>مثالية للمناسبات الرسمية، السهرات، أو احتفالات العيد. تتناسق بشكل طبيعي مع الأقراط المميزة والصنادل الأنيقة، لتقدم خياراً راقياً للمرأة الخليجية العصرية.</p>

<!-- gmc-enriched:start -->
<h3>تفاصيل المنتج</h3>
<ul>
<li><strong>الألوان:</strong> وردي، أزرق</li>
<li><strong>المقاسات:</strong> XS – 3XL</li>
<li><strong>مادة الصنع:</strong> قطن، حرير</li>
<li><strong>النقش:</strong> مطبوع</li>
</ul>
<!-- gmc-enriched:end -->`;

const AR_SEO_TITLE = 'درّاعة منية | نقوش بانداني بيضاء | أتيليه بلو مارين';
const AR_SEO_DESC = 'درّاعة منية بنقوش بانداني بيضاء، بالوردي أو الأزرق. صُنعت في أتيليه بالكويت، توصيل لكل دول الخليج. مثالية للسهرات والمناسبات.';

const NEW_TAGS = ['atelier', 'bandhani', 'blue', 'daraa', 'eid', 'evening', 'formal', 'gathering', 'gcc', 'gown', 'gulf', 'khaleeji', 'kuwait', 'luxury', 'pink', 'saudi', 'sheer-fabric', 'uae', 'white-print'];

// ---------- DRY PREVIEW ----------
console.log('=== EN ===');
console.log('SEO title :', EN_SEO_TITLE, `(${EN_SEO_TITLE.length})`);
console.log('SEO desc  :', EN_SEO_DESC, `(${EN_SEO_DESC.length})`);
console.log('tags      : burgundy → removed; +pink +blue');
console.log('body      : drop "deep burgundy hue" + "blue cuffs"→"cuffs"; Colors→Pink,Blue; Pattern Solid→Printed');
console.log('\n=== AR ===');
console.log('name fix  : "بحر" (sea) → "منية" (Munia)');
console.log('SEO title :', AR_SEO_TITLE);
console.log('SEO desc  :', AR_SEO_DESC);
console.log('body      : drop "عنابي"(burgundy) + blue-cuffs; Colors→وردي،أزرق; Pattern→مطبوع');

if (!APPLY) { console.log('\n(dry run — set APPLY=1 to write)'); process.exit(0); }

// ---------- 1. EN: productUpdate (body, seo, tags) ----------
console.log('\n[1] updating EN body / SEO / tags…');
const up = await gql(`mutation($input:ProductInput!){ productUpdate(input:$input){ product{ id seo{title description} } userErrors{ field message } } }`,
  { input: { id: gidP, descriptionHtml: EN_BODY, seo: { title: EN_SEO_TITLE, description: EN_SEO_DESC }, tags: NEW_TAGS } });
if (up.productUpdate.userErrors.length) throw new Error(JSON.stringify(up.productUpdate.userErrors));
console.log('  EN updated. SEO now:', JSON.stringify(up.productUpdate.product.seo));

// ---------- 2. fetch FRESH digests (changed after EN update) ----------
const dig = await gql(`query($id:ID!){ translatableResource(resourceId:$id){ translatableContent{ key digest } } }`, { id: gidP });
const D = Object.fromEntries(dig.translatableResource.translatableContent.map((c) => [c.key, c.digest]));

// ---------- 3. AR translations ----------
console.log('[2] registering AR translations…');
const reg = await gql(`mutation($id:ID!,$t:[TranslationInput!]!){ translationsRegister(resourceId:$id, translations:$t){ userErrors{ field message } translations{ key } } }`, {
  id: gidP,
  t: [
    { locale: 'ar', key: 'body_html', value: AR_BODY, translatableContentDigest: D['body_html'] },
    { locale: 'ar', key: 'meta_title', value: AR_SEO_TITLE, translatableContentDigest: D['meta_title'] },
    { locale: 'ar', key: 'meta_description', value: AR_SEO_DESC, translatableContentDigest: D['meta_description'] },
  ],
});
if (reg.translationsRegister.userErrors.length) throw new Error(JSON.stringify(reg.translationsRegister.userErrors));
console.log('  AR registered:', reg.translationsRegister.translations.map((t) => t.key).join(', '));
console.log('\n✅ A74 copy/SEO updated (EN + AR), burgundy removed, AR name bug fixed.');
