#!/usr/bin/env node
/**
 * Rename a114 — it's a One-Piece Daraa, not a Bisht Set.
 *  - productType: Bisht Set -> Daraa
 *  - Title EN: "A114 – Mai Bisht" -> "A114 – Mai Daraa"
 *  - Title AR: "A114 – مي بشت" -> "A114 – مي درّاعة"
 *  - Handle: a114-sahar-bisht -> a114-mai-daraa (fix Mai/Sahar mismatch + bisht->daraa)
 *  - Description EN & AR: rewrite as a single-piece daraa, drop "bisht", remove إطلالة
 *  - SEO title + meta (EN + AR)
 *  - Tags: drop bisht, kaftan, velvet
 *  - 301 redirect from old handle
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

const OLD_HANDLE = "a114-sahar-bisht";
const NEW_HANDLE = "a114-mai-daraa";

const NEW_TITLE_EN = "A114 – Mai Daraa";
const NEW_DESC_EN_HTML =
  "<p>Mai takes its name from the Arabic word for water, evoking the gentle flow of evening light. This one-piece daraa drapes with a flowing elegance that speaks of quiet confidence, its generous cut offering a graceful silhouette.</p>\n" +
  "<p>Crafted in a rich burgundy fabric, the bodice features intricate yellow paisley motifs scattered throughout, with contrasting solid burgundy panels on the sleeves and hem. Two delicate burgundy tassels add a touch of traditional detail. Atelier-made in Kuwait, reflecting a commitment to heritage craftsmanship.</p>\n" +
  "<p>Ideal for weddings, formal gatherings, or special evening occasions across the Gulf, the Mai Daraa is designed for the modern Khaleeji woman who values both tradition and contemporary style. It pairs effortlessly with fine jewellery for a complete look.</p>";
const NEW_SEO_TITLE_EN = "Mai Daraa | Burgundy Paisley | Atelier Blue Marine";
const NEW_SEO_DESC_EN =
  "Mai Daraa in burgundy with yellow paisley print. Atelier-made in Kuwait, delivered across the GCC. Perfect for weddings, evening, and formal occasions.";

const NEW_TITLE_AR = "A114 – مي درّاعة";
const NEW_BODY_AR =
  "<p>تحمل درّاعة مي اسمها من الكلمة العربية \"ماء\"، مستوحاةً من انسياب الضوء في المساء. تنسدل هذه الدرّاعة بأناقة هادئة وثقة راقية، وقصتها الواسعة تمنحها سيلويت ساحر.</p>\n" +
  "<p>مصنوعة من قماش عنابي غني، يتميز الصدر بزخارف بيزلي صفراء دقيقة متناثرة، مع ألواح عنابية صلبة متباينة على الأكمام والحاشية. شرابان عنابيان رقيقان يضيفان لمسة من التفاصيل التراثية. مصنوعة يدوياً في أتيليه الكويت، انعكاساً لحرفية تراثية أصيلة.</p>\n" +
  "<p>اختيار مثالي للأعراس، التجمعات الرسمية، أو سهرات المساء في أنحاء الخليج، صُممت درّاعة مي للمرأة الخليجية العصرية التي تجمع بين التراث والأسلوب المعاصر. تنسجم بسهولة مع المجوهرات الراقية لمظهر متكامل.</p>";
const NEW_META_TITLE_AR = "درّاعة مي | عنابي بنقوش بيزلي | أتيليه بلو مارين";
const NEW_META_DESC_AR =
  "درّاعة مي عنابي بطبعات بيزلي صفراء. مصنوعة يدوياً في أتيليه الكويت، توصيل لجميع دول الخليج. مثالية للأعراس والسهرات والمناسبات الرسمية.";

const DROP_TAGS = new Set(["bisht", "kaftan", "velvet"]);

const cur = await gql(
  `query($q:String!){ products(first:1, query:$q){ edges{ node{ id handle title productType tags } } } }`,
  { q: `handle:${OLD_HANDLE}` }
);
const product = cur.products.edges[0]?.node;
if (!product) { console.error("Product not found"); process.exit(1); }
console.log("Before:", product);

const newTags = (product.tags || []).filter((t) => !DROP_TAGS.has(t.toLowerCase()));

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
console.log("EN update:", JSON.stringify(upd.productUpdate, null, 2));

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

writeFileSync(resolve(__dirname, "..", "rename-a114.log.json"), JSON.stringify({
  before: product, after: upd.productUpdate, translations: tres.translationsRegister, redirect: rr.urlRedirectCreate,
}, null, 2));
console.log("\n✅ Done.");
