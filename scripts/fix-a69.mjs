#!/usr/bin/env node
/**
 * Fix A69 – Hatoon Dawn Daraa:
 *   1) Body prose: "Sahar" → "Hatoon" (EN) and "سحر" → "هتون" (AR)
 *   2) Featured image altText: "A69 – Sahar Dawn Daraa" → "A69 – Hatoon Dawn Daraa"
 *   3) shopify.color-pattern metafield: [Beige] → [Black, Rust Orange, Floral]
 *   4) Rebuild GMC enriched block (EN + AR) with: Colors=Black,Rust Orange / Pattern=Floral
 *
 * Usage:
 *   node scripts/fix-a69.mjs           # dry-run (default)
 *   node scripts/fix-a69.mjs --apply
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
const APPLY = process.argv.includes("--apply");

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

const PRODUCT_ID = "gid://shopify/Product/10231737385260";

const MARKER_START = "<!-- gmc-enriched:start -->";
const MARKER_END = "<!-- gmc-enriched:end -->";

const NEW_COLOR_PATTERN_GIDS = [
  "gid://shopify/Metaobject/169808855340",  // Black
  "gid://shopify/Metaobject/195628597548",  // Rust Orange
  "gid://shopify/Metaobject/169867346220",  // Floral
];

const EN_BLOCK = `\n${MARKER_START}
<h3>Product details</h3>
<ul>
<li><strong>Colors:</strong> Black, Rust Orange</li>
<li><strong>Sizes:</strong> XS – 3XL</li>
<li><strong>Material:</strong> Cotton, Silk</li>
<li><strong>Pattern:</strong> Floral</li>
</ul>
${MARKER_END}`;

const AR_BLOCK = `\n${MARKER_START}
<h3>تفاصيل المنتج</h3>
<ul>
<li><strong>الألوان:</strong> أسود، برتقالي صدئ</li>
<li><strong>المقاسات:</strong> XS – 3XL</li>
<li><strong>مادة الصنع:</strong> قطن، حرير</li>
<li><strong>النقش:</strong> نقش زهور</li>
</ul>
${MARKER_END}`;

function mergeBlock(html, block) {
  const safe = html || "";
  const re = new RegExp(`\\s*${MARKER_START}[\\s\\S]*?${MARKER_END}\\s*`);
  const stripped = safe.replace(re, "");
  return (stripped.trimEnd() + "\n" + block).trim();
}

// 1. Fetch current state
const current = await gql(
  `query($id:ID!){
    product(id:$id){
      id title handle descriptionHtml tags
      featuredImage { id altText }
      media(first: 20) { edges { node { id ... on MediaImage { image { url altText } } } } }
      translations(locale:"ar"){ key value }
    }
    translatableResource(resourceId:$id){
      translatableContent { key value digest }
    }
  }`,
  { id: PRODUCT_ID },
);

const p = current.product;
const arBody = current.product.translations.find((t) => t.key === "body_html")?.value || "";
const enDigest = current.translatableResource.translatableContent.find((c) => c.key === "body_html")?.digest;

// 2. Build new EN body
const enProseFixed = p.descriptionHtml.replace(/Sahar/g, "Hatoon");
const newEnHtml = mergeBlock(enProseFixed, EN_BLOCK);

// 3. Build new AR body
const arProseFixed = arBody.replace(/سحر/g, "هتون");
const newArHtml = mergeBlock(arProseFixed, AR_BLOCK);

// 4. New featured image altText
const newAlt = "A69 – Hatoon Dawn Daraa";
const mediaImageId = p.media.edges[0]?.node?.id;

console.log("=== PLANNED CHANGES FOR A69 ===\n");
console.log("EN body diff (prose):");
console.log("  before: ...The Sahar Dawn Daraa captures...");
console.log("  after:  ...The Hatoon Dawn Daraa captures...");
console.log("\nEN enriched block (new):");
console.log(EN_BLOCK);
console.log("\nAR enriched block (new):");
console.log(AR_BLOCK);
console.log("\nFeatured image altText:");
console.log(`  before: ${p.media.edges[0]?.node?.image?.altText || "(none)"}`);
console.log(`  after:  ${newAlt}`);
console.log("\nshopify.color-pattern metafield:");
console.log("  before: [Beige]");
console.log(`  after:  [Black, Rust Orange, Floral]`);

if (!APPLY) {
  console.log("\n[DRY RUN] Re-run with --apply to push changes.");
  process.exit(0);
}

console.log("\n=== APPLYING ===");

// 5. productUpdate: descriptionHtml + metafields
const productUpdateRes = await gql(
  `mutation($p:ProductInput!){
    productUpdate(input:$p){
      product{ id }
      userErrors{ field message }
    }
  }`,
  {
    p: {
      id: PRODUCT_ID,
      descriptionHtml: newEnHtml,
      metafields: [
        {
          namespace: "shopify",
          key: "color-pattern",
          type: "list.metaobject_reference",
          value: JSON.stringify(NEW_COLOR_PATTERN_GIDS),
        },
      ],
    },
  },
);
if (productUpdateRes.productUpdate.userErrors.length) {
  console.error("productUpdate errors:", productUpdateRes.productUpdate.userErrors);
  process.exit(1);
}
console.log("✓ EN body + color-pattern metafield updated");

// 6. Featured image altText
if (mediaImageId) {
  const mediaRes = await gql(
    `mutation($id:ID!, $alt:String){
      productImageUpdate: fileUpdate(files:[{id:$id, alt:$alt}]){
        files{ alt }
        userErrors{ field message }
      }
    }`,
    { id: mediaImageId, alt: newAlt },
  );
  if (mediaRes.productImageUpdate.userErrors.length) {
    console.error("fileUpdate errors:", mediaRes.productImageUpdate.userErrors);
  } else {
    console.log("✓ Featured image altText updated");
  }
}

// 7. AR body translation — re-fetch digest first (per memory: digest goes stale after productUpdate)
const refreshed = await gql(
  `query($id:ID!){
    translatableResource(resourceId:$id){
      translatableContent { key digest }
    }
  }`,
  { id: PRODUCT_ID },
);
const freshDigest = refreshed.translatableResource.translatableContent.find((c) => c.key === "body_html")?.digest;

const trRes = await gql(
  `mutation($id:ID!, $t:[TranslationInput!]!){
    translationsRegister(resourceId:$id, translations:$t){
      translations{ key }
      userErrors{ field message }
    }
  }`,
  {
    id: PRODUCT_ID,
    t: [{ locale: "ar", key: "body_html", value: newArHtml, translatableContentDigest: freshDigest }],
  },
);
if (trRes.translationsRegister.userErrors.length) {
  console.error("translationsRegister errors:", trRes.translationsRegister.userErrors);
  process.exit(1);
}
console.log("✓ AR body translation updated");

console.log("\n=== DONE ===");
