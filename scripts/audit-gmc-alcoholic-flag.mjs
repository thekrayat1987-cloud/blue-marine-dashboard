#!/usr/bin/env node
/**
 * Identify which products are likely being flagged by Google Merchant Center
 * as "Alcoholic beverages".
 *
 * Strategy: GMC's automated classifier flags items when:
 *  - product_type or google_product_category points to a Food/Beverage tree
 *  - title/description contains alcohol-related vocabulary (alcohol, denatured,
 *    parfum may slip through, eau de toilette, ethanol, etc.)
 *  - the item is a perfume/cologne but NOT categorized under
 *    "Health & Beauty > Personal Care > Cosmetics > Perfume & Cologne" (5915)
 *
 * We pull each product's google_product_category metafield + title +
 * description and group suspects.
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
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const URL_ = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

async function gql(query, variables = {}) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const Q = `query Products($cursor: String) {
  products(first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    edges { node {
      id
      title
      handle
      productType
      vendor
      status
      descriptionHtml
      tags
      googleCat: metafield(namespace: "mm-google-shopping", key: "google_product_category") { value }
      googleCat2: metafield(namespace: "google", key: "google_product_category") { value }
      customProduct: metafield(namespace: "mm-google-shopping", key: "custom_product") { value }
    } }
  }
}`;

const products = [];
let cursor = null;
let page = 0;
while (true) {
  page++;
  const data = await gql(Q, { cursor });
  for (const e of data.products.edges) products.push(e.node);
  process.stderr.write(`fetched page ${page} (${products.length} products)\n`);
  if (!data.products.pageInfo.hasNextPage) break;
  cursor = data.products.pageInfo.endCursor;
}

const ALCOHOL_WORDS = [
  /\balcohol\b/i,
  /\balcoolis/i,
  /\bdenatur/i,
  /\bethanol\b/i,
  /\beau de (parfum|toilette|cologne)\b/i,
  /\bspirit(s|ueux)?\b/i,
  /كحول/,
  /كحولي/,
  /روح/,
];

const PERFUME_WORDS = [
  /\bperfume\b/i,
  /\bparfum\b/i,
  /\bcologne\b/i,
  /\bfragrance\b/i,
  /عطر/,
  /برفان/,
  /بخور/,
  /دهن عود/,
  /مسك/,
];

const PERFUME_GOOGLE_CAT = "Health & Beauty > Personal Care > Cosmetics > Perfume & Cologne";

const suspects = [];
const perfumes = [];
const noGoogleCat = [];

for (const p of products) {
  if (p.status !== "ACTIVE") continue;
  const desc = (p.descriptionHtml || "").replace(/<[^>]+>/g, " ");
  const text = `${p.title} ${desc} ${(p.tags || []).join(" ")}`;
  const isPerfume =
    /fragrance/i.test(p.productType) ||
    PERFUME_WORDS.some((re) => re.test(text));
  const hasAlcoholWord = ALCOHOL_WORDS.some((re) => re.test(text));
  const cat = p.googleCat?.value || p.googleCat2?.value || null;
  const catLooksRight = cat && /perfume|cologne|cosmetics|apparel|clothing/i.test(cat);

  if (isPerfume) {
    perfumes.push({
      handle: p.handle,
      title: p.title,
      productType: p.productType,
      googleCat: cat,
      catLooksRight,
      hasAlcoholWord,
      customProduct: p.customProduct?.value,
    });
  }
  if (hasAlcoholWord && !isPerfume) {
    suspects.push({
      handle: p.handle,
      title: p.title,
      productType: p.productType,
      reason: "alcohol_word_in_text",
      googleCat: cat,
    });
  }
  if (!cat) {
    noGoogleCat.push({
      handle: p.handle,
      title: p.title,
      productType: p.productType,
    });
  }
}

const report = {
  total_active_products: products.filter((p) => p.status === "ACTIVE").length,
  perfume_count: perfumes.length,
  perfumes_missing_correct_category: perfumes.filter((p) => !p.catLooksRight).length,
  perfumes_with_alcohol_word: perfumes.filter((p) => p.hasAlcoholWord).length,
  suspects_with_alcohol_word_non_perfume: suspects.length,
  products_missing_any_google_category: noGoogleCat.length,
  perfumes,
  suspects,
  noGoogleCat_sample: noGoogleCat.slice(0, 20),
};

writeFileSync(
  resolve(__dirname, "..", "gmc-alcoholic-audit.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
