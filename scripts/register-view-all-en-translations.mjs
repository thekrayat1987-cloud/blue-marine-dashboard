#!/usr/bin/env node
/**
 * Register EN translations for the 3 "View all" button labels on the homepage.
 *
 * Source value (in templates/index.json) is "عرض الكل" (Arabic) — the AR side
 * keeps it as the source. We register EN translation = "View all" so the
 * /en-us/ Market shows English.
 *
 * Resource: gid://shopify/OnlineStoreTheme/182480240940
 *
 * Dry-run: node scripts/register-view-all-en-translations.mjs
 * Apply:   node scripts/register-view-all-en-translations.mjs --apply
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

const RESOURCE_ID = "gid://shopify/OnlineStoreTheme/182480240940";

// 1) Get the FULL translatable content for the theme to fetch correct digests
console.log("Fetching translatable content (full digests)…");
let allContent = [];
{
  const d = await gql(`{
    translatableResources(first: 5, resourceType: ONLINE_STORE_THEME) {
      edges { node {
        resourceId
        translatableContent { key value digest locale }
      }}
    }
  }`);
  for (const e of d.translatableResources.edges) {
    if (e.node.resourceId === RESOURCE_ID) {
      allContent = e.node.translatableContent;
    }
  }
}
console.log(`Total translatable items on theme: ${allContent.length}`);

// 2) Find the 3 "view all" items
const targets = allContent.filter(c =>
  c.value === "عرض الكل" &&
  c.key.includes("product_list_button") &&
  c.key.endsWith(".label") === false && // false because keys have :digest suffix
  c.key.includes(".label:")
);
console.log(`\nFound ${targets.length} targets:`);
for (const t of targets) {
  console.log(`  key:    ${t.key}`);
  console.log(`  digest: ${t.digest}`);
  console.log(`  source: "${t.value}"`);
  console.log();
}

if (targets.length === 0) {
  console.log("⚠️  No targets found (already fixed?).");
  process.exit(0);
}

// Build translations payload
const translations = targets.map(t => ({
  key: t.key,
  value: "View all",
  locale: "en",
  translatableContentDigest: t.digest,
}));

if (!APPLY) {
  console.log("Payload (en translations):");
  console.log(JSON.stringify(translations, null, 2));
  console.log("\nℹ️  Dry-run only. Re-run with --apply to push to Shopify.");
  process.exit(0);
}

// 3) Register the translations
const mutation = `
mutation Reg($resourceId: ID!, $translations: [TranslationInput!]!) {
  translationsRegister(resourceId: $resourceId, translations: $translations) {
    translations { key value locale }
    userErrors { field message }
  }
}`;

const res = await gql(mutation, { resourceId: RESOURCE_ID, translations });
const errs = res.translationsRegister.userErrors;
if (errs.length) {
  console.error("❌ Shopify rejected the change:");
  for (const e of errs) console.error(`  - [${e.field?.join(".")}] ${e.message}`);
  process.exit(1);
}
console.log(`✅ Registered ${res.translationsRegister.translations.length} EN translation(s):`);
for (const t of res.translationsRegister.translations) {
  console.log(`  ${t.locale}: "${t.value}"  (${t.key.slice(0, 80)}…)`);
}
