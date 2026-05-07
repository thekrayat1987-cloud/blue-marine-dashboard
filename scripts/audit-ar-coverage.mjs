#!/usr/bin/env node
/**
 * Audit Arabic translation coverage across the Shopify store.
 * For every translatable resource type, list strings that have an English
 * source value but no Arabic translation registered.
 *
 * Output is grouped by resource type, with checkout strings filtered out by
 * default (those have a separate, dedicated workflow). Pass --all to include them.
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
const URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;
const INCLUDE_CHECKOUT = process.argv.includes("--all");

async function gql(query, variables = {}) {
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  return r.json();
}

const TYPES = [
  "COLLECTION",
  "PRODUCT",
  "PRODUCT_OPTION",
  "PRODUCT_OPTION_VALUE",
  "ONLINE_STORE_PAGE",
  "ONLINE_STORE_BLOG",
  "ONLINE_STORE_ARTICLE",
  "ONLINE_STORE_MENU",
  "LINK",
  "ONLINE_STORE_THEME",
  "ONLINE_STORE_THEME_JSON_TEMPLATE",
  "ONLINE_STORE_THEME_SECTION_GROUP",
  "ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS",
  "ONLINE_STORE_THEME_SETTINGS_CATEGORY",
  "ONLINE_STORE_THEME_LOCALE_CONTENT",
  "ONLINE_STORE_THEME_APP_EMBED",
  "EMAIL_TEMPLATE",
  "SHOP",
  "SHOP_POLICY",
  "METAFIELD",
  "FILTER",
  "PAYMENT_GATEWAY",
  "DELIVERY_METHOD_DEFINITION",
  "PACKING_SLIP_TEMPLATE",
  "SELLING_PLAN",
  "SELLING_PLAN_GROUP",
];

const QUERY = `
  query($t: TranslatableResourceType!, $after: String) {
    translatableResources(resourceType: $t, first: 50, after: $after) {
      edges { cursor node {
        resourceId
        translatableContent { key value digest locale type }
        translations(locale: "ar") { key value }
      } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

function isCheckout(key) {
  return key.startsWith("shopify.checkout.") || key.startsWith("checkout.");
}

const summary = [];
const detail = {};

for (const type of TYPES) {
  let after = null;
  let total = 0;
  let withEn = 0;
  let missingAr = 0;
  const sampleMissing = [];
  let pages = 0;

  while (true) {
    const j = await gql(QUERY, { t: type, after });
    if (j.errors) {
      summary.push({ type, error: j.errors.map((e) => e.message).join("; ") });
      break;
    }
    const data = j.data.translatableResources;
    for (const e of data.edges) {
      const arByKey = new Map();
      for (const t of e.node.translations || []) arByKey.set(t.key, t.value);
      for (const c of e.node.translatableContent) {
        total++;
        const val = String(c.value || "").trim();
        if (!val) continue;
        // Heuristic: source must look like English (has at least one ASCII letter,
        // and not entirely Arabic). Skip pure code/IDs.
        const hasLatin = /[A-Za-z]/.test(val);
        if (!hasLatin) continue;
        withEn++;
        if (!INCLUDE_CHECKOUT && isCheckout(c.key)) continue;
        const ar = arByKey.get(c.key);
        if (!ar || !ar.trim()) {
          missingAr++;
          if (sampleMissing.length < 200) {
            sampleMissing.push({
              rid: e.node.resourceId,
              key: c.key,
              en: val.slice(0, 200),
              digest: c.digest,
            });
          }
        }
      }
    }
    pages++;
    if (!data.pageInfo.hasNextPage) break;
    after = data.pageInfo.endCursor;
    if (pages > 80) {
      summary.push({ type, note: "page cap reached at 80" });
      break;
    }
  }

  summary.push({ type, total_keys: total, en_keys: withEn, missing_ar: missingAr });
  if (sampleMissing.length) detail[type] = sampleMissing;
  console.log(
    `[${type}]  total=${total}  en_source=${withEn}  missing_ar=${missingAr}` +
      (INCLUDE_CHECKOUT ? "" : " (checkout excluded)"),
  );
}

console.log("\n========== SUMMARY ==========");
console.table(summary);

const out = resolve(__dirname, "..", "ar-audit-report.json");
writeFileSync(out, JSON.stringify({ summary, detail }, null, 2));
console.log(`\nFull report written to: ${out}`);

console.log("\n========== TOP MISSING (storefront-visible) ==========");
const VISIBLE_TYPES = [
  "COLLECTION",
  "PRODUCT",
  "PRODUCT_OPTION",
  "PRODUCT_OPTION_VALUE",
  "ONLINE_STORE_PAGE",
  "ONLINE_STORE_MENU",
  "LINK",
  "SHOP",
  "SHOP_POLICY",
  "METAFIELD",
  "FILTER",
];
for (const t of VISIBLE_TYPES) {
  const items = detail[t];
  if (!items || !items.length) continue;
  console.log(`\n--- ${t} (${items.length} sample) ---`);
  for (const it of items.slice(0, 12)) {
    console.log(`  ${it.rid}`);
    console.log(`    ${it.key} = ${JSON.stringify(it.en.slice(0, 100))}`);
  }
}
