#!/usr/bin/env node
/**
 * Fix a143:
 *  - productType: revert Bisht Set -> Two-Piece Daraa (it's a daraa set, not a bisht)
 *  - Title stays "A143 – Loulwa Daraa 2-Piece Set" (already correct)
 *  - SEO: replace "Aroob" -> "Loulwa" (EN + AR meta_title + meta_description)
 *  - Handle: a143-aroob-caftan-set -> a143-loulwa-daraa-set + 301 redirect
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
const STORE = process.env.SHOPIFY_STORE_URL;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const URL_ = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

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

const OLD_HANDLE = "a143-aroob-caftan-set";
const NEW_HANDLE = "a143-loulwa-daraa-set";
const NEW_TITLE_EN = "A143 – Loulwa Daraa 2-Piece Set";   // unchanged but enforced
const NEW_SEO_TITLE_EN = "Daraa Set Loulwa – Blue Patterned 2-Piece, Atelier Blue Marine";
const NEW_SEO_DESCRIPTION_EN = "Discover the Loulwa daraa two-piece set from Atelier Blue Marine. This blue and beige patterned daraa with a matching shawl features elegant gold embroidery. Perfect for formal evenings, weddings, and Eid gatherings across the Gulf.";

const NEW_TITLE_AR = "A143 – لؤلؤة درّاعة طقم ٢ قطع";    // unchanged but enforced
const NEW_META_TITLE_AR = "طقم درّاعة لؤلؤة – بنقوش زرقاء وذهبية، أتيليه بلو مارين";
const NEW_META_DESC_AR = "اكتشفي طقم درّاعة لؤلؤة من أتيليه بلو مارين. درّاعة من قطعتين بنقوش زرقاء وبيج مع شال، يتميز بتطريز ذهبي فاخر. مثالي للأمسيات الرسمية وحفلات الزفاف وتجمعات العيد في الخليج.";

// Fetch product
const cur = await gql(
  `query($q:String!){ products(first:1, query:$q){ edges{ node{ id handle title productType } } } }`,
  { q: `handle:${OLD_HANDLE}` }
);
const product = cur.products.edges[0]?.node;
if (!product) { console.error("Product not found"); process.exit(1); }
console.log("Found:", product);

// Update EN: title, handle, productType, SEO
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
    seo: { title: NEW_SEO_TITLE_EN, description: NEW_SEO_DESCRIPTION_EN },
  },
});
console.log("EN update:", JSON.stringify(upd.productUpdate, null, 2));

// Update AR translations
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
if (digestByKey.meta_title) translations.push({ locale: "ar", key: "meta_title", value: NEW_META_TITLE_AR, translatableContentDigest: digestByKey.meta_title });
if (digestByKey.meta_description) translations.push({ locale: "ar", key: "meta_description", value: NEW_META_DESC_AR, translatableContentDigest: digestByKey.meta_description });

const tres = await gql(REGISTER, { resourceId: product.id, translations });
console.log("AR translations:", JSON.stringify(tres.translationsRegister, null, 2));

// 301 redirect
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

writeFileSync(resolve(__dirname, "..", "rename-a143.log.json"), JSON.stringify({
  before: product, after: upd.productUpdate, translations: tres.translationsRegister, redirect: rr.urlRedirectCreate,
}, null, 2));
console.log("\n✅ Done.");
