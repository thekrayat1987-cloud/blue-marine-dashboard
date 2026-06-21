#!/usr/bin/env node
/**
 * Full rename of a96 — it's a Two-Piece Daraa (3 colors), not a Bisht.
 *  - productType: Bisht Set -> Two-Piece Daraa
 *  - Title EN: "A96 – Zumurud Bisht Daraa" -> "A96 – Zumurud Daraa 2-Piece Set"
 *  - Title AR: "A96 – زمرّد بشت درّاعة" -> "A96 – زمرّد درّاعة طقم ٢ قطع"
 *  - Handle: a96-zumurud-bisht-daraa -> a96-zumurud-daraa-set (+ 301 redirect)
 *  - Description EN & AR: remove "bisht" / "single-piece" references, make color-neutral
 *    (product now has 3 colors: Deep Plum, Burgundy, Royal Navy)
 *  - SEO title + meta description (EN + AR)
 */
import { readFileSync, writeFileSync } from "node:fs";
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

const OLD_HANDLE = "a96-zumurud-bisht-daraa";
const NEW_HANDLE = "a96-zumurud-daraa-set";

const NEW_TITLE_EN = "A96 – Zumurud Daraa 2-Piece Set";
const NEW_DESC_EN_HTML =
  "<p>Zumurud, meaning emerald, lends its jewel-like depth to this striking two-piece daraa ensemble. Its flowing silhouette drapes with an understated grandeur, designed for movement and presence.</p>\n" +
  "<p>Crafted from sheer, rich fabric available in Deep Plum, Burgundy, and Royal Navy, the daraa features delicate gold motifs scattered across its length. A wide, intricately patterned gold border defines the front opening and neckline, highlighting the meticulous handiwork of the Atelier Blue Marine in Kuwait.</p>\n" +
  "<p>This two-piece daraa ensemble is an elegant choice for formal gatherings, Eid celebrations, or a special evening. It offers a confident blend of heritage and contemporary style for women across the Gulf.</p>";
const NEW_SEO_TITLE_EN = "Zumurud Daraa 2-Piece Set | Gold Embroidery | Atelier Blue Marine";
const NEW_SEO_DESC_EN =
  "Zumurud Daraa 2-Piece Set in rich fabric with intricate gold embroidery. Available in Deep Plum, Burgundy, and Royal Navy. Made-to-order in Kuwait for formal gatherings, Eid, and special evenings across the Gulf.";

const NEW_TITLE_AR = "A96 – زمرّد درّاعة طقم ٢ قطع";
const NEW_BODY_AR =
  "<p>الزمرد، الذي يعني الياقوت الأخضر، يمنح عمقه الجوهري لهذا الطقم الأنيق من قطعتين من الدرّاعة. تتدفق قصتها بانسيابية وفخامة هادئة، مصممة للحركة والحضور المميز.</p>\n" +
  "<p>صُنعت هذه الدرّاعة من قماش شفاف وغني، متوفرة بألوان البرقوق العميق، العنابي، والكحلي الملكي. تزدان بنقوش ذهبية رقيقة تتناثر على طولها، ويحدد شريط ذهبي عريض ومزخرف بدقة فتحة الدرّاعة الأمامية وخط العنق، مما يبرز براعة أتيليه بلو مارين في الكويت.</p>\n" +
  "<p>هذا الطقم من قطعتين من الدرّاعة هو خيار أنيق للمناسبات الرسمية، احتفالات العيد، أو سهرة خاصة. يقدّم مزيجًا واثقًا من التراث والأسلوب المعاصر للمرأة في جميع أنحاء الخليج.</p>";
const NEW_META_TITLE_AR = "طقم درّاعة زمرّد ٢ قطع | تطريز ذهبي | أتيليه بلو مارين";
const NEW_META_DESC_AR =
  "طقم درّاعة زمرّد من قطعتين بقماش غني مع تطريز ذهبي دقيق. متوفر بألوان البرقوق العميق، العنابي، والكحلي الملكي. يُصنع حسب الطلب في الكويت للمناسبات الرسمية، العيد، والسهرات الخاصة في جميع أنحاء الخليج.";

// Fetch product
const cur = await gql(
  `query($q:String!){ products(first:1, query:$q){ edges{ node{ id handle title productType } } } }`,
  { q: `handle:${OLD_HANDLE}` }
);
const product = cur.products.edges[0]?.node;
if (!product) { console.error("Product not found"); process.exit(1); }
console.log("Before:", product);

// 1. Update EN: title, handle, productType, descriptionHtml, SEO
const MUT_PRODUCT = `mutation($input: ProductInput!) {
  productUpdate(input: $input) {
    product { id handle title productType seo { title description } }
    userErrors { field message }
  }
}`;
const upd = await gql(MUT_PRODUCT, {
  input: {
    id: product.id,
    title: NEW_TITLE_EN,
    handle: NEW_HANDLE,
    productType: "Two-Piece Daraa",
    descriptionHtml: NEW_DESC_EN_HTML,
    seo: { title: NEW_SEO_TITLE_EN, description: NEW_SEO_DESC_EN },
  },
});
console.log("EN update:", JSON.stringify(upd.productUpdate, null, 2));

// 2. AR translations
const trData = await gql(
  `query($id:ID!){ translatableResource(resourceId:$id){ translatableContent { key value digest locale } } }`,
  { id: product.id }
);
const digestByKey = Object.fromEntries(trData.translatableResource.translatableContent.map((t) => [t.key, t.digest]));

const REGISTER = `mutation($resourceId:ID!, $translations:[TranslationInput!]!) {
  translationsRegister(resourceId:$resourceId, translations:$translations) {
    translations { key value locale }
    userErrors { field message }
  }
}`;
const translations = [];
if (digestByKey.title) translations.push({ locale: "ar", key: "title", value: NEW_TITLE_AR, translatableContentDigest: digestByKey.title });
if (digestByKey.body_html) translations.push({ locale: "ar", key: "body_html", value: NEW_BODY_AR, translatableContentDigest: digestByKey.body_html });
if (digestByKey.meta_title) translations.push({ locale: "ar", key: "meta_title", value: NEW_META_TITLE_AR, translatableContentDigest: digestByKey.meta_title });
if (digestByKey.meta_description) translations.push({ locale: "ar", key: "meta_description", value: NEW_META_DESC_AR, translatableContentDigest: digestByKey.meta_description });

const tres = await gql(REGISTER, { resourceId: product.id, translations });
console.log("AR translations:", JSON.stringify(tres.translationsRegister, null, 2));

// 3. 301 redirect
const REDIRECT_MUT = `mutation($urlRedirect: UrlRedirectInput!) {
  urlRedirectCreate(urlRedirect: $urlRedirect) {
    urlRedirect { id path target }
    userErrors { field message }
  }
}`;
const rr = await gql(REDIRECT_MUT, {
  urlRedirect: { path: `/products/${OLD_HANDLE}`, target: `/products/${NEW_HANDLE}` },
});
console.log("Redirect:", JSON.stringify(rr.urlRedirectCreate, null, 2));

writeFileSync(resolve(__dirname, "..", "rename-a96.log.json"), JSON.stringify({
  before: product, after: upd.productUpdate, translations: tres.translationsRegister, redirect: rr.urlRedirectCreate,
}, null, 2));
console.log("\n✅ Done.");
