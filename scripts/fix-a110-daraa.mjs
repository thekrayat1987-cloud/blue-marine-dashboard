#!/usr/bin/env node
/**
 * Fix A110: it was mislabeled as a Bisht — it's actually a Daraa.
 * Also fixes description body that mentioned "Sahar" while title says "Hayfa".
 *
 *  - title:        A110 – Hayfa Bisht           → A110 – Hayfa Daraa
 *  - handle:       a110-sahar-black-bisht       → a110-hayfa-black-daraa  (+ 301 redirect)
 *  - productType:  Bisht Set                    → Daraa
 *  - SEO title/desc: bisht → daraa
 *  - body_html: Sahar→Hayfa, bisht→daraa
 *  - tags: drop "bisht"
 *  - AR: بشت → درّاعة, سحر → هيفاء
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

const HANDLE_OLD = "a110-sahar-black-bisht";
const HANDLE_NEW = "a110-hayfa-black-daraa";

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

const tr = await gql(
  `query($id:ID!){ translatableResource(resourceId:$id){
    translatableContent{ key value digest }
    translations(locale:"ar"){ key value }
  } }`,
  { id: p.id },
);
const enContent = Object.fromEntries(
  (tr.translatableResource?.translatableContent || []).map((c) => [c.key, c]),
);
const arVals = Object.fromEntries(
  (tr.translatableResource?.translations || []).map((x) => [x.key, x.value]),
);
p.translations = Object.entries(arVals).map(([key, value]) => ({ key, value }));

const newTitleEn = "A110 – Hayfa Daraa";
const newSeoTitle = "Hayfa Black Daraa | Embroidered Evening Gown | Atelier Blue Marine";
const newSeoDesc =
  "The Hayfa black daraa, featuring scattered gold motifs and intricate embroidery. Made-to-order in Kuwait for evening events and weddings across the Gulf. Shop Khaleeji luxury.";
const newDescHtml = p.descriptionHtml
  .replaceAll("Sahar Bisht", "Hayfa Daraa")
  .replaceAll("Sahar", "Hayfa")
  .replaceAll("Bisht", "Daraa")
  .replaceAll("bisht", "daraa")
  .replaceAll("This daraa", "This daraa");
const newTags = p.tags.filter((t) => t.toLowerCase() !== "bisht");

console.log("━━━ EN updates ━━━");
console.log(`title:        ${p.title} → ${newTitleEn}`);
console.log(`handle:       ${p.handle} → ${HANDLE_NEW}`);
console.log(`productType:  ${p.productType} → Daraa`);
console.log(`tags removed: bisht`);

const upd = await gql(
  `mutation($i:ProductInput!){ productUpdate(input:$i){
    product{ id handle title productType }
    userErrors{ field message }
  } }`,
  {
    i: {
      id: p.id,
      title: newTitleEn,
      handle: HANDLE_NEW,
      productType: "Daraa",
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

// Re-fetch translatable content to get fresh digests for AR translation register
const trNew = await gql(
  `query($id:ID!){ translatableResource(resourceId:$id){
    translatableContent{ key value digest }
  } }`,
  { id: p.id },
);
const enContentNew = Object.fromEntries(
  (trNew.translatableResource?.translatableContent || []).map((c) => [c.key, c]),
);

const arTitleEn = "A110 – هيفاء درّاعة";
const arSeoTitle = "هيفاء درّاعة سوداء | تطريز ذهبي خليجي | أتيليه بلو مارين";
const arSeoDesc =
  "درّاعة هيفاء السوداء، بتطريز ذهبي دقيق وزخارف متناثرة. صنع حسب الطلب في الكويت للسهرات والأعراس في الخليج. تسوقي الفخامة الخليجية.";
const arBodyOld = p.translations.find((t) => t.key === "body_html")?.value || "";
const arBodyNew = arBodyOld
  .replaceAll("بشت سحر", "درّاعة هيفاء")
  .replaceAll("سحر", "هيفاء")
  .replaceAll("بشت", "درّاعة");

// IMPORTANT: digests must come from the NEW (post-update) translatableContent — productUpdate
// changed body_html/title/seo, so the old digests are now stale. Re-fetch after productUpdate.
const arPayload = [];
function pushAr(key, value) {
  const digest = enContentNew[key]?.digest;
  if (!digest) return;
  arPayload.push({ locale: "ar", key, value, translatableContentDigest: digest });
}
pushAr("title", arTitleEn);
pushAr("meta_title", arSeoTitle);
pushAr("meta_description", arSeoDesc);
pushAr("body_html", arBodyNew);

console.log("━━━ AR updates ━━━");
console.log(`title:    → ${arTitleEn}`);
console.log(`SEO title:→ ${arSeoTitle}`);

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

// 301 redirect old → new
console.log("━━━ URL redirect ━━━");
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
  console.log(`✓ Redirect created: ${red.urlRedirectCreate.urlRedirect.path} → ${red.urlRedirectCreate.urlRedirect.target}`);
}

console.log("\nDone. New URL: https://bluemarineatelier.com/products/" + HANDLE_NEW);
