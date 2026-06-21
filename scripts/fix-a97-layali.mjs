#!/usr/bin/env node
/**
 * Rename A97: "Yaqut Emerald" (ruby red + emerald — both color-specific names)
 * to "Layali" (nights) — color-agnostic since the product has 4 colors.
 *
 *  - handle:       a97-yaqut-daraa-set            → a97-layali-daraa-set  (+ 301)
 *  - title EN:     A97 – Yaqut Emerald Daraa 2-Piece Set → A97 – Layali Daraa 2-Piece Set
 *  - title AR:     A97 – ياقوت زمرد طقم درّاعة قطعتين     → A97 – ليالي طقم درّاعة قطعتين
 *  - SEO + description rewritten so they no longer claim "deep red only".
 *  - tags: drop "yaqut" / "emerald" / "red" / single-color tags if present.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const URL_ = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${process.env.SHOPIFY_API_VERSION || "2024-10"}/graphql.json`;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

async function gql(q, v = {}) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query: q, variables: v }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const HANDLE_OLD = "a97-yaqut-daraa-set";
const HANDLE_NEW = "a97-layali-daraa-set";

const cur = await gql(
  `query($h:String!){ productByHandle(handle:$h){
    id handle title productType tags descriptionHtml
    seo { title description }
  } }`,
  { h: HANDLE_OLD },
);
if (!cur.productByHandle) {
  console.error(`Product ${HANDLE_OLD} not found`);
  process.exit(1);
}
const p = cur.productByHandle;

const newDescHtml = `<p>Layali takes its name from the Arabic word for "nights" — an ode to formal evenings and the moments that define them. This 2-piece daraa set offers a flowing, confident silhouette across a curated palette of red, burgundy, pink, and blue.</p>
<p>The coordinated set features a long daraa top with a V-neckline and wide sleeves, paired with a matching skirt. Both pieces showcase intricate gold brocade patterns, woven into the fabric, highlighting traditional Khaleeji motifs. Atelier Blue Marine crafts each set in Kuwait with precise detail.</p>
<p>Designed for formal evenings, wedding receptions, or special family gatherings, this daraa set makes a distinct impression. It is an effortless choice for the woman who values heritage and contemporary style.</p>

<!-- gmc-enriched:start -->
<h3>Product details</h3>
<ul>
<li>
<strong>Colors:</strong> Red, Burgundy, Pink, Blue</li>
<li>
<strong>Sizes:</strong> XS – 3XL</li>
<li>
<strong>Material:</strong> Cotton, Silk</li>
<li>
<strong>Pattern:</strong> Brocade</li>
</ul>
<!-- gmc-enriched:end -->`;

const newTitleEn = "A97 – Layali Daraa 2-Piece Set";
const newSeoTitle = "Layali Daraa 2-Piece Set | Khaleeji Brocade | Atelier Blue Marine";
const newSeoDesc =
  "Layali daraa 2-piece set in red, burgundy, pink, or blue with intricate gold brocade patterns. Atelier-made in Kuwait for formal evenings, weddings, and gatherings across the Gulf.";

// Drop color-specific and old-name tags
const dropTags = new Set([
  "yaqut",
  "emerald",
  "ruby",
  "red-only",
]);
const newTags = (p.tags || []).filter((t) => !dropTags.has(t.toLowerCase()));

console.log("━━━ EN updates ━━━");
console.log(`title:   ${p.title} → ${newTitleEn}`);
console.log(`handle:  ${p.handle} → ${HANDLE_NEW}`);
console.log(`SEO title: → ${newSeoTitle}`);

const upd = await gql(
  `mutation($i:ProductInput!){ productUpdate(input:$i){
    product{ id handle title }
    userErrors{ field message }
  } }`,
  {
    i: {
      id: p.id,
      title: newTitleEn,
      handle: HANDLE_NEW,
      tags: newTags,
      descriptionHtml: newDescHtml,
      seo: { title: newSeoTitle, description: newSeoDesc },
    },
  },
);
if (upd.productUpdate.userErrors.length) {
  console.error("productUpdate errors:", upd.productUpdate.userErrors);
  process.exit(1);
}
console.log("✓ productUpdate OK");

// Re-fetch translatable content digests (productUpdate invalidated them)
const trNew = await gql(
  `query($id:ID!){ translatableResource(resourceId:$id){
    translatableContent{ key value digest }
  } }`,
  { id: p.id },
);
const enContentNew = Object.fromEntries(
  (trNew.translatableResource?.translatableContent || []).map((c) => [c.key, c]),
);

const arTitle = "A97 – ليالي طقم درّاعة قطعتين";
const arSeoTitle = "ليالي طقم درّاعة قطعتين | بروكار خليجي | أتيليه بلو مارين";
const arSeoDesc =
  "طقم درّاعة ليالي من قطعتين بنقوش بروكار ذهبية معقدة، متوفر بألوان الأحمر والعنابي والوردي والأزرق. صنع في أتيليه كويتي للسهرات الرسمية والأعراس والتجمعات الخاصة. توصيل لكل دول الخليج.";
const arBody = `<p>تستوحي ليالي اسمها من الكلمة العربية التي تعني الأمسيات والسهرات — تكريمًا للحظات الراقية التي تميّز كل مناسبة. هذه الدرّاعة المكونة من قطعتين تقدم قصة انسيابية واثقة بألوان متعددة: الأحمر، العنابي، الوردي، والأزرق.</p>
<p>يتميز الطقم المنسق بقطعة علوية طويلة بقصة درّاعة مع ياقة على شكل V وأكمام واسعة، تتناسق مع تنورة مطابقة. تُظهر القطعتان نقوش بروكار ذهبية معقدة، منسوجة في القماش، تبرز الزخارف الخليجية التقليدية. يُصنع كل طقم في أتيليه بلو مارين في الكويت بدقة متناهية.</p>
<p>صُممت هذه الدرّاعة للسهرات الرسمية، حفلات الزفاف، أو التجمعات العائلية الخاصة، لتترك انطباعًا مميزًا. إنها خيار سهل للمرأة التي تقدر التراث والأسلوب المعاصر.</p>

<!-- gmc-enriched:start -->
<h3>تفاصيل المنتج</h3>
<ul>
<li><strong>الألوان:</strong> أحمر، عنابي، وردي، أزرق</li>
<li><strong>المقاسات:</strong> XS – 3XL</li>
<li><strong>مادة الصنع:</strong> قطن، حرير</li>
<li><strong>النقش:</strong> بروكار</li>
</ul>
<!-- gmc-enriched:end -->`;

const arPayload = [];
function pushAr(key, value) {
  const digest = enContentNew[key]?.digest;
  if (!digest) return;
  arPayload.push({ locale: "ar", key, value, translatableContentDigest: digest });
}
pushAr("title", arTitle);
pushAr("meta_title", arSeoTitle);
pushAr("meta_description", arSeoDesc);
pushAr("body_html", arBody);

const trans = await gql(
  `mutation($id:ID!,$t:[TranslationInput!]!){
    translationsRegister(resourceId:$id, translations:$t){
      translations{ key }
      userErrors{ field message }
    }
  }`,
  { id: p.id, t: arPayload },
);
if (trans.translationsRegister.userErrors.length) {
  console.error("AR translation errors:", trans.translationsRegister.userErrors);
  process.exit(1);
}
console.log("✓ AR translations OK");

const red = await gql(
  `mutation($i:UrlRedirectInput!){ urlRedirectCreate(urlRedirect:$i){
    urlRedirect{ id path target }
    userErrors{ field message }
  } }`,
  { i: { path: `/products/${HANDLE_OLD}`, target: `/products/${HANDLE_NEW}` } },
);
if (red.urlRedirectCreate.userErrors.length) {
  const msg = red.urlRedirectCreate.userErrors[0].message;
  if (/already exists|taken/i.test(msg)) {
    console.log(`ℹ️  Redirect already exists for /products/${HANDLE_OLD}`);
  } else {
    console.error("redirect errors:", red.urlRedirectCreate.userErrors);
  }
} else {
  console.log(
    `✓ Redirect created: ${red.urlRedirectCreate.urlRedirect.path} → ${red.urlRedirectCreate.urlRedirect.target}`,
  );
}

console.log("\nDone. New URL: https://bluemarineatelier.com/products/" + HANDLE_NEW);
