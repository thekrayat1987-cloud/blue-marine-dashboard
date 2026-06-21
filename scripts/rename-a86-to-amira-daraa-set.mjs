#!/usr/bin/env node
/**
 * Rename a86 — it's a Two-Piece Daraa (3 colors), not a Bisht Set.
 *  - productType: Bisht Set -> Two-Piece Daraa
 *  - Title EN: "A86 – Amira 2-Piece Dara Set" -> "A86 – Amira Daraa 2-Piece Set" (fix typo)
 *  - Title AR: "A86 – أميرة طقم ٢ قطع درّاعة" -> "A86 – أميرة درّاعة طقم ٢ قطع"
 *  - Handle: a86-amira-dara-bisht-set -> a86-amira-daraa-set (fix typo + remove "bisht-set")
 *  - Description EN & AR: make color-neutral (3 colors: Emerald Green, Classic Black, Burgundy)
 *  - SEO title + meta (EN + AR)
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

const OLD_HANDLE = "a86-amira-dara-bisht-set";
const NEW_HANDLE = "a86-amira-daraa-set";

const NEW_TITLE_EN = "A86 – Amira Daraa 2-Piece Set";
const NEW_DESC_EN_HTML =
  "<p>Amira takes its name from the Arabic word for princess, embodying a regal presence in its flowing silhouette. This two-piece daraa set is designed for an elegant drape that moves with grace.</p>\n" +
  "<p>The daraa's neckline is detailed with mirror-like embellishments, adding a subtle sparkle. Paired with it is a richly patterned bisht, featuring a vibrant blend of colors and finished with a delicate gold trim. Available in Emerald Green, Classic Black, and Burgundy — each piece is atelier-made in Kuwait, reflecting meticulous craftsmanship.</p>\n" +
  "<p>An ideal choice for formal dinners, sophisticated gatherings, or Eid celebrations across the Gulf, this set offers versatility and timeless appeal. It is an effortless option for the woman who seeks heritage style with a contemporary cut.</p>";
const NEW_SEO_TITLE_EN = "Amira Daraa 2-Piece Set | Mirror Embellishments | Atelier Blue Marine";
const NEW_SEO_DESC_EN =
  "Amira Daraa 2-Piece Set with mirror-detailed neckline and richly patterned matching piece. Available in Emerald Green, Classic Black, and Burgundy. Atelier-made in Kuwait for formal evenings, weddings, and Eid celebrations across the Gulf.";

const NEW_TITLE_AR = "A86 – أميرة درّاعة طقم ٢ قطع";
const NEW_BODY_AR =
  "<p>يحمل طقم أميرة اسمه من الكلمة العربية \"أميرة\"، مجسداً حضوراً ملكياً بقصته الانسيابية. طقم درّاعة من قطعتين، مصمم بانسيابية أنيقة تتحرك برشاقة.</p>\n" +
  "<p>تتميز فتحة عنق الدرّاعة بتطريزات شبيهة بالمرايا، تضفي لمسة من البريق الناعم. يرافقها بشت منقوش غني، يجمع بين ألوان نابضة بالحياة ومزين بحواف ذهبية دقيقة. متوفر بألوان الزمردي، الأسود الكلاسيكي، والعنابي — كل قطعة مصنوعة يدوياً في أتيليه الكويت، مما يعكس براعة الصنع.</p>\n" +
  "<p>اختيار مثالي للعشاء الرسمي، أو التجمعات الراقية، أو احتفالات العيد في أنحاء الخليج، حيث يوفر هذا الطقم أناقة متعددة الاستخدامات وجاذبية خالدة. إنه خيار سهل للمرأة التي تبحث عن الأسلوب التراثي بلمسة عصرية.</p>";
const NEW_META_TITLE_AR = "طقم درّاعة أميرة ٢ قطع | تطريز مرايا | أتيليه بلو مارين";
const NEW_META_DESC_AR =
  "طقم درّاعة أميرة من قطعتين بفتحة عنق مزينة بتطريزات المرايا وقطعة مرافقة منقوشة. متوفر بألوان الزمردي، الأسود الكلاسيكي، والعنابي. مصنوع يدوياً في أتيليه الكويت للسهرات الرسمية، الأعراس، واحتفالات العيد في أنحاء الخليج.";

const cur = await gql(
  `query($q:String!){ products(first:1, query:$q){ edges{ node{ id handle title productType } } } }`,
  { q: `handle:${OLD_HANDLE}` }
);
const product = cur.products.edges[0]?.node;
if (!product) { console.error("Product not found"); process.exit(1); }
console.log("Before:", product);

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

writeFileSync(resolve(__dirname, "..", "rename-a86.log.json"), JSON.stringify({
  before: product, after: upd.productUpdate, translations: tres.translationsRegister, redirect: rr.urlRedirectCreate,
}, null, 2));
console.log("\n✅ Done.");
