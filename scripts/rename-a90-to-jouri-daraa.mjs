#!/usr/bin/env node
/**
 * Rename A90: Asala Daraa → Jouri Daraa (disambiguates from A93 Asalah).
 *  - title:        A90 – Asala Daraa            → A90 – Jouri Daraa
 *  - handle:       a90-asala-printed-daraa      → a90-jouri-daraa  (+ 301 redirect)
 *  - SEO title/desc: rewrite around "Jouri" (damask rose)
 *  - body_html: replace "Asala" / "authenticity" hooks with Jouri / damask-rose hooks
 *  - tags: drop name-specific tags ("printed-daraa" etc. that referenced old name slug)
 *  - AR: أصالة → جوري throughout
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

const HANDLE_OLD = "a90-asala-printed-daraa";
const HANDLE_NEW = "a90-jouri-daraa";

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
    translations(locale:"ar"){ key value }
  } }`,
  { id: p.id },
);
const arVals = Object.fromEntries(
  (tr.translatableResource?.translations || []).map((x) => [x.key, x.value]),
);

// ---------- EN ----------
const newTitleEn = "A90 – Jouri Daraa";
const newSeoTitleEn = "Jouri Daraa – Black & Burgundy Patterned, Atelier Blue Marine";
const newSeoDescEn =
  "Flowing Jouri daraa in deep black and burgundy patterned chiffon — named for the damask rose. Lightweight, single-piece, and perfect for evenings, gatherings, and Eid across the Gulf. Designed by Atelier Blue Marine.";

// Rewrite body around the new name (Jouri = damask rose) without losing pattern/color details
const newDescHtmlEn = `<p>Jouri, named for the damask rose, captures romance and depth in this flowing daraa's silhouette and intricate print. Designed for graceful movement, this single-piece garment offers a relaxed yet refined presence for any occasion.</p>
<p>The lightweight chiffon features a distinctive pattern in deep tones of black and burgundy, accented by a subtle border print at the hem and cuffs. A relaxed V-neckline with delicate ties completes the design, reflecting the meticulous craft of Atelier Blue Marine.</p>`;

const newTags = [
  ...p.tags.filter(
    (t) =>
      !["asala", "printed-daraa", "printed"].includes(t.toLowerCase()) &&
      t !== "أصالة",
  ),
];

console.log("━━━ EN updates ━━━");
console.log(`title:        ${p.title} → ${newTitleEn}`);
console.log(`handle:       ${p.handle} → ${HANDLE_NEW}`);
console.log(`SEO title:    → ${newSeoTitleEn}`);
console.log(`tags removed: asala, printed-daraa, printed, أصالة`);

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
      descriptionHtml: newDescHtmlEn,
      seo: { title: newSeoTitleEn, description: newSeoDescEn },
    },
  },
);
if (upd.productUpdate.userErrors.length) {
  console.error("productUpdate errors:", upd.productUpdate.userErrors);
  process.exit(1);
}
console.log("✓ productUpdate OK");

// Re-fetch digests after EN write (digest goes stale after productUpdate)
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
const newTitleAr = "A90 – جوري درّاعة";
const newSeoTitleAr = "درّاعة جوري – أسود وعنّابي بنقوش، أتيليه بلو مارين";
const newSeoDescAr =
  "درّاعة جوري الفضفاضة من الشيفون المطبّع بدرجات الأسود والعنّابي — مستوحاة من وردة الجوري. خفيفة، قطعة واحدة، مثالية للأمسيات، التجمعات، واحتفالات العيد في الخليج. تصميم أتيليه بلو مارين.";

// Rebuild AR body in Arabic — feminine agreement, references damask rose
const newBodyAr = `<p>جوري، اسم مستوحى من وردة الجوري، يحمل الرومانسية والعمق في تصميم هذه الدرّاعة الفضفاضة ونقوشها الدقيقة. مصمّمة لحركة سلسة وانسيابية، تمنحكِ قطعة واحدة حضوراً متّزناً وراقياً لأي مناسبة.</p>
<p>قماش الشيفون الخفيف يتميّز بنقوش بدرجات الأسود والعنّابي، مع إطار مطبّع رقيق عند الذيل والأكمام. فتحة رقبة V مريحة مع رباطات ناعمة تكمّل التصميم، انعكاساً لدقّة صنع أتيليه بلو مارين.</p>`;

const arPayload = [];
function pushAr(key, value) {
  const digest = enContentNew[key]?.digest;
  if (!digest) return;
  arPayload.push({ locale: "ar", key, value, translatableContentDigest: digest });
}
pushAr("title", newTitleAr);
pushAr("meta_title", newSeoTitleAr);
pushAr("meta_description", newSeoDescAr);
pushAr("body_html", newBodyAr);

console.log("━━━ AR updates ━━━");
console.log(`title:     → ${newTitleAr}`);
console.log(`SEO title: → ${newSeoTitleAr}`);

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
    `✓ Redirect: ${red.urlRedirectCreate.urlRedirect.path} → ${red.urlRedirectCreate.urlRedirect.target}`,
  );
}

console.log("\nDone. New URL: https://bluemarineatelier.com/products/" + HANDLE_NEW);
