#!/usr/bin/env node
/**
 * Audit storefront filter translations: list translatable resources of type
 * SHOP_POLICY, ONLINE_STORE_THEME_LOCALE_CONTENT, FILTER, etc., and look for
 * filter label / facet value translations in Arabic.
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

const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

async function gql(query, variables = {}) {
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  return r.json();
}

// 1. Probe common resource types relevant to filters
const TYPES = [
  "FILTER",
  "ONLINE_STORE_THEME_LOCALE_CONTENT",
  "ONLINE_STORE_THEME_SECTION_GROUP",
  "ONLINE_STORE_THEME_JSON_TEMPLATE",
  "ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS",
  "ONLINE_STORE_THEME_SETTINGS_CATEGORY",
  "PRODUCT_OPTION",
  "PRODUCT_OPTION_VALUE",
];

for (const t of TYPES) {
  const q = `query($t: TranslatableResourceType!, $first: Int!) {
    translatableResources(resourceType: $t, first: $first) {
      edges { node { resourceId translatableContent { key value digest locale } } }
    }
  }`;
  const j = await gql(q, { t, first: 5 });
  const edges = j.data?.translatableResources?.edges || [];
  console.log(`\n=== ${t} (${edges.length} sample, error=${j.errors ? "yes" : "no"}) ===`);
  if (j.errors) {
    console.log("  ", JSON.stringify(j.errors).slice(0, 200));
    continue;
  }
  for (const e of edges) {
    console.log(`  ${e.node.resourceId}`);
    for (const c of e.node.translatableContent.slice(0, 3)) {
      console.log(`     ${c.key} = ${JSON.stringify(c.value).slice(0, 80)}`);
    }
  }
}
