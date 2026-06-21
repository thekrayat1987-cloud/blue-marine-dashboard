#!/usr/bin/env node
/**
 * Fix A132: change from "caftan" to "daraa" in EN + AR.
 *
 *  - title:        A132 – Hawa Caftan       → A132 – Hawa Daraa
 *  - handle:       a132-hawa-caftan         → a132-hawa-daraa  (+ 301 redirect)
 *  - productType:  Daraa                    (already correct, no change)
 *  - SEO title/desc: caftan → daraa
 *  - body_html: caftan → daraa
 *  - tags: drop "caftan" + "قفطان", add "daraa"
 *  - AR: قفطان → درّاعة, with feminine agreement
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

const HANDLE_OLD = "a132-hawa-caftan";
const HANDLE_NEW = "a132-hawa-daraa";

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
const arVals = Object.fromEntries(
  (tr.translatableResource?.translations || []).map((x) => [x.key, x.value]),
);

// ---------- EN ----------
const newTitleEn = "A132 – Hawa Daraa";
const newSeoTitle = "Hawa Daraa – Patterned Green, Atelier Blue Marine";
const newSeoDesc =
  "Flowing Hawa daraa in green patterned fabric, also available in blue. Perfect for casual gatherings, Eid, or special occasions in Kuwait. Designed by Atelier Blue Marine.";
const newDescHtml = p.descriptionHtml
  .replaceAll("Caftan", "Daraa")
  .replaceAll("caftan", "daraa");
const newTags = [
  ...p.tags.filter((t) => t.toLowerCase() !== "caftan" && t !== "قفطان"),
  "daraa",
];

console.log("━━━ EN updates ━━━");
console.log(`title:        ${p.title} → ${newTitleEn}`);
console.log(`handle:       ${p.handle} → ${HANDLE_NEW}`);
console.log(`SEO title:    → ${newSeoTitle}`);
console.log(`tags removed: caftan, قفطان`);
console.log(`tags added:   daraa`);

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

// Re-fetch translatable content for fresh digests (digest goes stale after productUpdate)
const trNew = await gql(
  `query($id:ID!){ translatableResource(resourceId:$id){
    translatableContent{ key value digest }
  } }`,
  { id: p.id },
);
const enContentNew = Object.fromEntries(
  (trNew.translatableResource?.translatableContent || []).map((c) => [c.key, c]),
);

// ---------- AR ----------
const arTitleNew = "A132 – هوى درّاعة";
const arSeoTitleNew = "درّاعة هوى – أخضر مزيّن، أتيليه بلو مارين";
const arSeoDescNew =
  "درّاعة هوى فضفاضة بنقوش خضراء، متوفرة أيضاً باللون الأزرق. مثالية للتجمعات العائلية، العيد، أو المناسبات الخاصة في الكويت. تصميم أتيليه بلو مارين.";

// Original AR body uses masculine grammar (قفطان is masculine, درّاعة is feminine).
// Rebuild with feminine agreement rather than blind string replace.
const arBodyOld = arVals.body_html || "";
const arBodyNew = arBodyOld
  .replace("قفطان هوى هو قطعة فضفاضة", "درّاعة هوى هي قطعة فضفاضة")
  .replace("متوفر أيضًا", "متوفرة أيضًا")
  .replace("يتميز هذا القفطان", "تتميز هذه الدرّاعة")
  .replace("يمكن ارتداؤه", "يمكن ارتداؤها")
  .replaceAll("القفطان", "الدرّاعة")
  .replaceAll("قفطان", "درّاعة");

const arPayload = [];
function pushAr(key, value) {
  const digest = enContentNew[key]?.digest;
  if (!digest) return;
  arPayload.push({ locale: "ar", key, value, translatableContentDigest: digest });
}
pushAr("title", arTitleNew);
pushAr("meta_title", arSeoTitleNew);
pushAr("meta_description", arSeoDescNew);
pushAr("body_html", arBodyNew);

console.log("━━━ AR updates ━━━");
console.log(`title:     → ${arTitleNew}`);
console.log(`SEO title: → ${arSeoTitleNew}`);

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
  console.log(
    `✓ Redirect created: ${red.urlRedirectCreate.urlRedirect.path} → ${red.urlRedirectCreate.urlRedirect.target}`,
  );
}

console.log("\nDone. New URL: https://bluemarineatelier.com/products/" + HANDLE_NEW);
