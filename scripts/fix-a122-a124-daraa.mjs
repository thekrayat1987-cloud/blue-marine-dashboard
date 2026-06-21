#!/usr/bin/env node
/**
 * Fix A122 (Layali) and A124 (Noor): change from "caftan" to "daraa" in EN + AR.
 * Same pattern as scripts/fix-a132-daraa.mjs.
 *
 *  - title:        A122 – Layali Caftan       → A122 – Layali Daraa
 *  - title:        A124 – Noor Caftan         → A124 – Noor Daraa
 *  - handle:       a122-layali-caftan         → a122-layali-daraa  (+ 301 redirect)
 *  - handle:       a124-noor-printed-caftan   → a124-noor-daraa    (+ 301 redirect)
 *  - SEO title/desc: caftan → daraa
 *  - body_html: caftan → daraa (with feminine agreement in AR)
 *  - tags: drop "caftan" + "قفطان"
 *  - AR: قفطان → درّاعة, with feminine agreement (masc → fem)
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

const PRODUCTS = [
  {
    handleOld: "a122-layali-caftan",
    handleNew: "a122-layali-daraa",
    titleEn: "A122 – Layali Daraa",
    titleAr: "A122 – ليالي درّاعة",
    seoTitleEn: "Layali Daraa – Blue Patterned, Atelier Blue Marine",
    seoDescEn:
      "Flowing patterned daraa in deep blue and red, with a tie-neck and wide sleeves. Perfect for evenings, gatherings, and Eid across the Gulf. Designed by Atelier Blue Marine.",
    seoTitleAr: "درّاعة ليالي – نقوش أزرق وأحمر، أتيليه بلو مارين",
    seoDescAr:
      "درّاعة بنقوش وتصميم أنيق يجمع بين الأزرق الداكن والأحمر. مثالية للجمعات العائلية، الأمسيات، واحتفالات العيد في الخليج. اكتشفي التراث الفاخر من أتيليه بلو مارين.",
  },
  {
    handleOld: "a124-noor-printed-caftan",
    handleNew: "a124-noor-daraa",
    titleEn: "A124 – Noor Daraa",
    titleAr: "A124 – نور درّاعة",
    seoTitleEn: "Noor Daraa – Patterned Navy, Atelier Blue Marine",
    seoDescEn:
      "Discover the Noor patterned daraa in sheer navy with maroon and gold accents. A luxurious piece by Atelier Blue Marine for evenings, gatherings, and Eid across the Gulf.",
    seoTitleAr: "درّاعة نور – بنقوش كحلي، أتيليه بلو مارين",
    seoDescAr:
      "اكتشفي درّاعة نور من القماش الكحلي الشفاف بنقوش عنابية وذهبية. قطعة فاخرة من أتيليه بلو مارين للأمسيات، التجمعات، واحتفالات العيد في الخليج.",
  },
];

// ----- Arabic feminine-agreement rewrite for body_html -----
// قفطان is masculine, درّاعة is feminine. Replace common masculine phrasings with feminine.
function rewriteArBody(s) {
  return s
    // common verbal/adjective forms
    .replaceAll("هذا القفطان", "هذه الدرّاعة")
    .replaceAll("ذلك القفطان", "تلك الدرّاعة")
    .replaceAll("القفطان", "الدرّاعة")
    .replaceAll("قفطان", "درّاعة")
    .replaceAll("متوفر أيضًا", "متوفرة أيضًا")
    .replaceAll("متوفر أيضاً", "متوفرة أيضاً")
    .replaceAll("يتميز", "تتميز")
    .replaceAll("يمكن ارتداؤه", "يمكن ارتداؤها")
    .replaceAll("مصنوع", "مصنوعة")
    .replaceAll("مصمم", "مصمّمة")
    .replaceAll("أنيق", "أنيقة")
    .replaceAll("فاخر ", "فاخرة ")
    .replaceAll("مثالي ", "مثالية ");
}

function rewriteEnBody(s) {
  return s.replaceAll("Caftan", "Daraa").replaceAll("caftan", "daraa");
}

for (const cfg of PRODUCTS) {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`Processing ${cfg.handleOld} → ${cfg.handleNew}`);
  console.log("═".repeat(70));

  const cur = await gql(
    `query($h:String!){ productByHandle(handle:$h){
      id handle title productType tags descriptionHtml
      seo { title description }
    } }`,
    { h: cfg.handleOld },
  );
  if (!cur.productByHandle) {
    console.error(`✗ Product ${cfg.handleOld} not found — skipping`);
    continue;
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

  // ---------- EN update ----------
  const newDescHtml = rewriteEnBody(p.descriptionHtml);
  const newTags = [
    ...p.tags.filter(
      (t) => t.toLowerCase() !== "caftan" && t !== "قفطان" && t.toLowerCase() !== "printed",
    ),
    "daraa",
  ];

  console.log("─── EN ───");
  console.log(`  title:        ${p.title} → ${cfg.titleEn}`);
  console.log(`  handle:       ${p.handle} → ${cfg.handleNew}`);
  console.log(`  SEO title:    → ${cfg.seoTitleEn}`);
  console.log(`  tags removed: caftan, قفطان, printed`);
  console.log(`  tags added:   daraa`);

  const upd = await gql(
    `mutation($i:ProductInput!){ productUpdate(input:$i){
      product{ id handle title }
      userErrors{ field message }
    } }`,
    {
      i: {
        id: p.id,
        title: cfg.titleEn,
        handle: cfg.handleNew,
        tags: newTags,
        descriptionHtml: newDescHtml,
        seo: { title: cfg.seoTitleEn, description: cfg.seoDescEn },
      },
    },
  );
  if (upd.productUpdate.userErrors.length) {
    console.error("✗ productUpdate errors:", upd.productUpdate.userErrors);
    continue;
  }
  console.log("✓ productUpdate OK");

  // Re-fetch digests (digest goes stale after productUpdate)
  const trNew = await gql(
    `query($id:ID!){ translatableResource(resourceId:$id){
      translatableContent{ key value digest }
    } }`,
    { id: p.id },
  );
  const enContentNew = Object.fromEntries(
    (trNew.translatableResource?.translatableContent || []).map((c) => [c.key, c]),
  );

  // ---------- AR update ----------
  const arBodyOld = arVals.body_html || "";
  const arBodyNew = rewriteArBody(arBodyOld);

  const arPayload = [];
  function pushAr(key, value) {
    const digest = enContentNew[key]?.digest;
    if (!digest) return;
    arPayload.push({ locale: "ar", key, value, translatableContentDigest: digest });
  }
  pushAr("title", cfg.titleAr);
  pushAr("meta_title", cfg.seoTitleAr);
  pushAr("meta_description", cfg.seoDescAr);
  pushAr("body_html", arBodyNew);

  console.log("─── AR ───");
  console.log(`  title:     → ${cfg.titleAr}`);
  console.log(`  SEO title: → ${cfg.seoTitleAr}`);

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
    console.error("✗ AR translation errors:", trans.translationsRegister.userErrors);
    continue;
  }
  console.log("✓ AR translations OK");

  // ---------- 301 redirect ----------
  const red = await gql(
    `mutation($i:UrlRedirectInput!){ urlRedirectCreate(urlRedirect:$i){
      urlRedirect{ id path target }
      userErrors{ field message }
    } }`,
    { i: { path: `/products/${cfg.handleOld}`, target: `/products/${cfg.handleNew}` } },
  );
  if (red.urlRedirectCreate.userErrors.length) {
    const msg = red.urlRedirectCreate.userErrors[0].message;
    if (/already exists|taken/i.test(msg)) {
      console.log(`ℹ️  Redirect already exists for /products/${cfg.handleOld}`);
    } else {
      console.error("redirect errors:", red.urlRedirectCreate.userErrors);
    }
  } else {
    console.log(
      `✓ Redirect: ${red.urlRedirectCreate.urlRedirect.path} → ${red.urlRedirectCreate.urlRedirect.target}`,
    );
  }

  console.log(`\nDone: https://bluemarineatelier.com/products/${cfg.handleNew}`);
}
