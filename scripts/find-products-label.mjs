#!/usr/bin/env node
/**
 * Locate where the "Products" heading on the storefront comes from.
 * Likely candidates: a COLLECTION title, or a theme locale string in
 * ONLINE_STORE_THEME_LOCALE_CONTENT (e.g. general.products / collections.all.title).
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

// --- 1. List all collections + their Arabic translation status ---
console.log("=== COLLECTIONS ===");
const cj = await gql(`{
  collections(first: 50) {
    edges { node { id handle title } }
  }
}`);
for (const e of cj.data.collections.edges) {
  const n = e.node;
  console.log(`  ${n.id}  handle=${n.handle}  title=${JSON.stringify(n.title)}`);
}

// --- 2. Search ONLINE_STORE_THEME_LOCALE_CONTENT for any key/value matching "products" ---
console.log("\n=== THEME LOCALE 'products' MATCHES ===");
let after = null;
let pages = 0;
const matches = [];
while (true) {
  const j = await gql(
    `query($after: String) {
      translatableResources(resourceType: ONLINE_STORE_THEME_LOCALE_CONTENT, first: 50, after: $after) {
        edges { cursor node {
          resourceId
          translatableContent { key value digest locale type }
        } }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    { after },
  );
  if (j.errors) {
    console.error(j.errors);
    break;
  }
  for (const e of j.data.translatableResources.edges) {
    for (const c of e.node.translatableContent) {
      if (
        /products?$/i.test(String(c.value).trim()) ||
        /\.products?(\.|$)/i.test(c.key) ||
        /collections?\.all/i.test(c.key)
      ) {
        matches.push({ rid: e.node.resourceId, key: c.key, val: c.value, digest: c.digest, locale: c.locale });
      }
    }
  }
  pages++;
  if (!j.data.translatableResources.pageInfo.hasNextPage) break;
  after = j.data.translatableResources.pageInfo.endCursor;
  if (pages > 20) break;
}
for (const m of matches) {
  console.log(`  ${m.rid}`);
  console.log(`    key=${m.key}  locale=${m.locale}  val=${JSON.stringify(String(m.val).slice(0, 80))}`);
  console.log(`    digest=${m.digest}`);
}
console.log(`\nTotal matches: ${matches.length} across ${pages} page(s)`);
