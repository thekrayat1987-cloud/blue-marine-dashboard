#!/usr/bin/env node
/**
 * Fix the last 4 caftan/قفطان leaks in the catalog:
 *  - A65  Marjan 3-Piece Set        → drop stale "caftan" tag (rest is clean)
 *  - A130 Sultana Caftan 2-Piece Set → Sultana Daraa 2-Piece Set
 *  - A149 Bayan Caftan              → Bayan Daraa (also strips banned word إطلالات)
 *  - A160 Wafa Caftan 2-Piece Set   → Wafa Daraa 2-Piece Set
 *
 * Uses the two-pass digest pattern (refetch translatableContent between EN write and AR register)
 * to avoid the silent "hash invalid" failure on translations.
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

// ───────────── EN/AR rewriters (feminine agreement for AR; قفطان=masc, درّاعة=fem) ─────────────
function rewriteEn(s) {
  return s
    .replaceAll("Caftan", "Daraa")
    .replaceAll("caftan", "daraa");
}
function rewriteAr(s) {
  return s
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
    // banned-word policy (no إطلالة/إطلالات)
    .replaceAll("الإطلالات", "المظهر")
    .replaceAll("إطلالات", "مظهر")
    .replaceAll("الإطلالة", "المظهر")
    .replaceAll("إطلالة", "مظهر");
}

// ──────────────── Per-product overrides for title/SEO (clean rewrites) ────────────────
const PRODUCTS = [
  {
    handleOld: "a130-sultana-caftan-set",
    handleNew: "a130-sultana-daraa-set",
    titleEn: "A130 – Sultana Daraa 2-Piece Set",
    titleAr: "A130 – سلطانة درّاعة طقم ٢ قطع",
    seoTitleEn: "Sultana Daraa 2-Piece Set – Patterned, Atelier Blue Marine",
    seoDescEn:
      "Two-piece Sultana daraa set with elegant patterns and a matching shawl. Perfect for evenings, weddings, and formal occasions across the Gulf. Designed by Atelier Blue Marine.",
    seoTitleAr: "طقم درّاعة سلطانة قطعتين – بنقوش، أتيليه بلو مارين",
    seoDescAr:
      "طقم درّاعة سلطانة قطعتين بتصميم أنماط أنيقة مع شال مطابق. مثالي للسهرات وحفلات الزفاف والمناسبات الرسمية في الخليج من أتيليه بلو مارين.",
  },
  {
    handleOld: "a149-bayan-caftan",
    handleNew: "a149-bayan-daraa",
    titleEn: "A149 – Bayan Daraa",
    titleAr: "A149 – بيان درّاعة",
    seoTitleEn: "Bayan Daraa – Blue Chiffon, Atelier Blue Marine",
    seoDescEn:
      "Bayan daraa in blue and white patterned chiffon with embroidered neckline. Perfect for gatherings, special occasions, and summer days across the Gulf.",
    seoTitleAr: "درّاعة بيان – شيفون أزرق، أتيليه بلو مارين",
    seoDescAr:
      "درّاعة بيان من شيفون أزرق وأبيض بنقشة مميزة وتطريز على الرقبة. مثالية للتجمعات والمناسبات الخاصة والأيام الصيفية في الخليج.",
  },
  {
    handleOld: "a160-wafa-caftan-2-piece-set",
    handleNew: "a160-wafa-daraa-2-piece-set",
    titleEn: "A160 – Wafa Daraa 2-Piece Set",
    titleAr: "A160 – وفاء درّاعة طقم ٢ قطع",
    seoTitleEn: "Wafa Daraa 2-Piece Set – Golden Jacquard, Atelier Blue Marine",
    seoDescEn:
      "Two-piece Wafa daraa set in gold jacquard with red trim and a matching inner piece. Designed by Atelier Blue Marine for evening events and celebrations across the Gulf.",
    seoTitleAr: "طقم درّاعة وفاء قطعتين – جاكار ذهبي، أتيليه بلو مارين",
    seoDescAr:
      "طقم درّاعة وفاء قطعتين بقماش جاكار ذهبي مع حواف حمراء وقطعة داخلية مطابقة. من أتيليه بلو مارين للمناسبات المسائية والاحتفالات في الخليج.",
  },
];

// ───────────────── Per-product workflow ─────────────────
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
    console.error(`✗ ${cfg.handleOld} not found — skipping`);
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

  const newDescHtmlEn = rewriteEn(p.descriptionHtml || "");
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
        descriptionHtml: newDescHtmlEn,
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

  const arBodyOld = arVals.body_html || "";
  const arBodyNew = rewriteAr(arBodyOld);

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
}

// ─────────── A65: drop stale "caftan" tag only ───────────
console.log(`\n${"═".repeat(70)}`);
console.log(`A65: dropping stale "caftan" tag`);
console.log("═".repeat(70));
const a65 = await gql(
  `query($h:String!){ productByHandle(handle:$h){ id tags } }`,
  { h: "a65-marjan-daraa-set" },
);
if (a65.productByHandle) {
  const cleaned = a65.productByHandle.tags.filter(
    (t) => t.toLowerCase() !== "caftan" && t !== "قفطان",
  );
  const upd = await gql(
    `mutation($i:ProductInput!){ productUpdate(input:$i){
      product{ id tags } userErrors{ field message }
    } }`,
    { i: { id: a65.productByHandle.id, tags: cleaned } },
  );
  if (upd.productUpdate.userErrors.length) {
    console.error("✗ A65 tag cleanup errors:", upd.productUpdate.userErrors);
  } else {
    console.log("✓ A65 tags cleaned");
  }
} else {
  console.error("✗ A65 not found");
}

console.log("\n✓ All caftan cleanup done.");
