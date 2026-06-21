#!/usr/bin/env node
/**
 * Rename a81 — it's a one-piece Daraa, not a Bisht Set.
 *  - productType: Bisht Set -> Daraa
 *  - Title EN: "A81 – Sahar Velvet Bisht" -> "A81 – Sahar Daraa"
 *  - Title AR: "A81 – سحر مخمل بشت" -> "A81 – سحر درّاعة"
 *  - Handle: a81-sahar-velvet-bisht -> a81-sahar-daraa (+ 301 redirect)
 *  - descriptionHtml (EN + AR): bisht -> daraa, drop "layering option" framing
 *  - SEO title + meta (EN + AR): bisht -> daraa
 *  - Tags: drop bisht
 *
 * Dry-run by default; pass --apply to write to Shopify.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APPLY = process.argv.includes("--apply");

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

const OLD_HANDLE = "a81-sahar-velvet-bisht";
const NEW_HANDLE = "a81-sahar-daraa";

const NEW_TITLE_EN = "A81 – Sahar Daraa";
const NEW_DESC_EN_HTML =
  "<p>Sahar Daraa, named for the enchanting desert night, is a testament to refined Khaleeji elegance. Its flowing one-piece silhouette drapes with subtle grandeur, designed for the woman who commands attention with quiet confidence.</p>\n" +
  "<p>Crafted from deep navy velvet, this atelier-made daraa features intricate paisley embroidery in rich burgundy and subtle blue hues across the neckline and cuffs. The sheer sleeves add a touch of delicate contrast, showcasing the meticulous detail characteristic of Kuwaiti craftsmanship.</p>\n" +
  "<p>Perfect for formal gatherings, weddings, or special evening events, the Sahar Daraa offers a sophisticated, ready-to-wear silhouette. It pairs seamlessly with traditional gold jewellery, making it an effortless choice for the modern Gulf woman.</p>\n\n" +
  "<!-- gmc-enriched:start -->\n<h3>Product details</h3>\n<ul>\n<li>\n<strong>Colors:</strong> Beige, Blue, Navy</li>\n<li>\n<strong>Sizes:</strong> 3XS – 5XL</li>\n<li>\n<strong>Material:</strong> Cotton, Silk</li>\n<li>\n<strong>Pattern:</strong> Solid</li>\n</ul>\n<!-- gmc-enriched:end -->";
const NEW_SEO_TITLE_EN = "Sahar Daraa | Navy Velvet Embroidered Khaleeji Gown | Atelier Blue Marine";
const NEW_SEO_DESC_EN =
  "Sahar Daraa in navy velvet with burgundy embroidery. Made-to-order in Kuwait for weddings and formal evenings across the Gulf. Shop luxury Khaleeji wear.";

const NEW_TITLE_AR = "A81 – سحر درّاعة";
const NEW_BODY_AR =
  "<p>درّاعة سحر، المستوحاة من سحر ليالي الصحراء، شهادة على أناقة الخليج الراقية. قصتها الانسيابية بقطعة واحدة تضفي هيبة رقيقة، مصممة للمرأة التي تلفت الأنظار بثقة هادئة.</p>\n" +
  "<p>صُنعت هذه الدرّاعة في أتيليه كويتي من مخمل كحلي عميق، تتميز بتطريز بيزلي دقيق بدرجات العنابي الغنية والأزرق الهادئ على خط العنق والأكمام. الأكمام الشفافة تضيف لمسة رقيقة متباينة، تُظهر التفاصيل الدقيقة التي تميز الحرفية الكويتية.</p>\n" +
  "<p>مثالية للتجمعات الرسمية، حفلات الزفاف، أو المناسبات المسائية الخاصة، درّاعة سحر تقدم تصميماً راقياً جاهزاً للارتداء. تنسجم بسلاسة مع المجوهرات الذهبية التقليدية، مما يجعلها خياراً سهلاً للمرأة الخليجية العصرية.</p>\n\n" +
  "<!-- gmc-enriched:start -->\n<h3>تفاصيل المنتج</h3>\n<ul>\n<li><strong>الألوان:</strong> بيج، أزرق، كحلي</li>\n<li><strong>المقاسات:</strong> 3XS – 5XL</li>\n<li><strong>مادة الصنع:</strong> قطن، حرير</li>\n<li><strong>النقش:</strong> سادة</li>\n</ul>\n<!-- gmc-enriched:end -->";
const NEW_META_TITLE_AR = "درّاعة سحر | مخمل كحلي مطرّز خليجي | أتيليه بلو مارين";
const NEW_META_DESC_AR =
  "درّاعة سحر بمخمل كحلي وتطريز عنابي. صنع حسب الطلب في الكويت للأعراس والسهرات الرسمية في جميع أنحاء الخليج. تسوقي الفخامة الخليجية.";

const DROP_TAG_RE = /bisht/i;

const cur = await gql(
  `query($q:String!){ products(first:1, query:$q){ edges{ node{ id handle title productType tags } } } }`,
  { q: `handle:${OLD_HANDLE}` },
);
const product = cur.products.edges[0]?.node;
if (!product) {
  console.error("Product not found:", OLD_HANDLE);
  process.exit(1);
}
console.log("Before:", product);

const newTags = (product.tags || []).filter((t) => !DROP_TAG_RE.test(t));

console.log("\n━━━ Planned EN updates ━━━");
console.log(`title:        ${product.title} → ${NEW_TITLE_EN}`);
console.log(`handle:       ${product.handle} → ${NEW_HANDLE}`);
console.log(`productType:  ${product.productType} → Daraa`);
console.log(`SEO title:    → ${NEW_SEO_TITLE_EN}`);
console.log(`SEO desc:     → ${NEW_SEO_DESC_EN}`);
console.log(`tags before:  ${product.tags?.join(", ") || "(none)"}`);
console.log(`tags after:   ${newTags.join(", ") || "(none)"}`);

console.log("\n━━━ Planned AR updates ━━━");
console.log(`title AR:     → ${NEW_TITLE_AR}`);
console.log(`meta_title:   → ${NEW_META_TITLE_AR}`);
console.log(`meta_desc:    → ${NEW_META_DESC_AR}`);

if (!APPLY) {
  console.log("\n(dry-run — pass --apply to push to Shopify)");
  process.exit(0);
}

const MUT_PRODUCT = `mutation($input: ProductInput!) {
  productUpdate(input: $input) {
    product { id handle title productType tags seo { title description } }
    userErrors { field message }
  }
}`;
const upd = await gql(MUT_PRODUCT, {
  input: {
    id: product.id,
    title: NEW_TITLE_EN,
    handle: NEW_HANDLE,
    productType: "Daraa",
    descriptionHtml: NEW_DESC_EN_HTML,
    seo: { title: NEW_SEO_TITLE_EN, description: NEW_SEO_DESC_EN },
    tags: newTags,
  },
});
console.log("\nEN update:", JSON.stringify(upd.productUpdate, null, 2));
if (upd.productUpdate.userErrors.length) process.exit(1);

const trData = await gql(
  `query($id:ID!){ translatableResource(resourceId:$id){ translatableContent { key value digest locale } } }`,
  { id: product.id },
);
const digestByKey = Object.fromEntries(
  trData.translatableResource.translatableContent.map((t) => [t.key, t.digest]),
);

const REGISTER = `mutation($resourceId:ID!, $translations:[TranslationInput!]!) {
  translationsRegister(resourceId:$resourceId, translations:$translations) {
    translations { key value locale }
    userErrors { field message }
  }
}`;
const translations = [];
if (digestByKey.title)
  translations.push({ locale: "ar", key: "title", value: NEW_TITLE_AR, translatableContentDigest: digestByKey.title });
if (digestByKey.body_html)
  translations.push({ locale: "ar", key: "body_html", value: NEW_BODY_AR, translatableContentDigest: digestByKey.body_html });
if (digestByKey.meta_title)
  translations.push({ locale: "ar", key: "meta_title", value: NEW_META_TITLE_AR, translatableContentDigest: digestByKey.meta_title });
if (digestByKey.meta_description)
  translations.push({ locale: "ar", key: "meta_description", value: NEW_META_DESC_AR, translatableContentDigest: digestByKey.meta_description });

const tres = await gql(REGISTER, { resourceId: product.id, translations });
console.log("\nAR translations:", JSON.stringify(tres.translationsRegister, null, 2));

const REDIRECT_MUT = `mutation($urlRedirect: UrlRedirectInput!) {
  urlRedirectCreate(urlRedirect: $urlRedirect) {
    urlRedirect { id path target }
    userErrors { field message }
  }
}`;
const rr = await gql(REDIRECT_MUT, {
  urlRedirect: { path: `/products/${OLD_HANDLE}`, target: `/products/${NEW_HANDLE}` },
});
console.log("\nRedirect:", JSON.stringify(rr.urlRedirectCreate, null, 2));

writeFileSync(
  resolve(__dirname, "..", "rename-a81.log.json"),
  JSON.stringify(
    {
      before: product,
      after: upd.productUpdate,
      translations: tres.translationsRegister,
      redirect: rr.urlRedirectCreate,
    },
    null,
    2,
  ),
);
console.log("\n✅ Done. New URL: https://bluemarineatelier.com/products/" + NEW_HANDLE);
