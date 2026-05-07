#!/usr/bin/env node
/**
 * Explore which Shopify translatable resource type holds the checkout/system
 * labels (Contact, Delivery, First name, Subtotal, etc.).
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

const TYPES = [
  "ONLINE_STORE_THEME",
  "ONLINE_STORE_THEME_APP_EMBED",
  "ONLINE_STORE_THEME_JSON_TEMPLATE",
  "ONLINE_STORE_THEME_LOCALE_CONTENT",
  "ONLINE_STORE_THEME_SECTION_GROUP",
  "ONLINE_STORE_THEME_SETTINGS_CATEGORY",
  "ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS",
  "EMAIL_TEMPLATE",
  "PACKING_SLIP_TEMPLATE",
  "DELIVERY_METHOD_DEFINITION",
  "PAYMENT_GATEWAY",
  "SHOP",
  "SHOP_POLICY",
];

const SEARCH = /checkout|contact|delivery|address|shipping|first.?name|last.?name|postal|city|country|subtotal|total|cart|email|payment/i;

for (const type of TYPES) {
  const j = await gql(
    `query($t: TranslatableResourceType!, $after: String) {
      translatableResources(resourceType: $t, first: 50, after: $after) {
        edges { cursor node {
          resourceId
          translatableContent { key value digest locale type }
        } }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    { t: type },
  );
  if (j.errors) {
    console.log(`[${type}] ERROR: ${j.errors.map((e) => e.message).join("; ")}`);
    continue;
  }
  const edges = j.data.translatableResources.edges;
  let totalKeys = 0;
  let matchKeys = 0;
  const samples = [];
  for (const e of edges) {
    for (const c of e.node.translatableContent) {
      totalKeys++;
      if (SEARCH.test(c.key) || SEARCH.test(c.value)) {
        matchKeys++;
        if (samples.length < 8)
          samples.push({ rid: e.node.resourceId, key: c.key, val: String(c.value).slice(0, 70) });
      }
    }
  }
  console.log(
    `[${type}] edges=${edges.length} keys=${totalKeys} checkout_matches=${matchKeys}` +
      (j.data.translatableResources.pageInfo.hasNextPage ? " (more pages)" : ""),
  );
  for (const s of samples) console.log(`   ${s.rid} :: ${s.key} = ${JSON.stringify(s.val)}`);
}
