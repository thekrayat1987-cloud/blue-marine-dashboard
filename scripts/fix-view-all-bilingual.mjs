#!/usr/bin/env node
/**
 * Make the 3 "View all" homepage buttons bilingual.
 *
 * Architecture before:
 *   - Source (EN primary): "عرض الكل"   ← wrong, Arabic in English-source slot
 *   - AR translation: none
 *   - Result: AR & EN both show Arabic
 *
 * Architecture after (this script):
 *   - Source (EN primary): "View all"
 *   - AR translation: "عرض الكل"
 *   - Result: /en-us/ shows "View all", / (AR) shows "عرض الكل"
 *
 * Steps:
 *   1. Register AR translations = "عرض الكل" (idempotent, no visual change)
 *   2. PUT updated templates/index.json with English source
 *   3. Verify both locales
 *
 * Dry-run: node scripts/fix-view-all-bilingual.mjs
 * Apply:   node scripts/fix-view-all-bilingual.mjs --apply
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
const THEME_ID = "182480240940";
const RESOURCE_ID = `gid://shopify/OnlineStoreTheme/${THEME_ID}`;
const REST = `https://${STORE}/admin/api/${VERSION}/themes/${THEME_ID}/assets.json`;
const GRAPHQL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;
const APPLY = process.argv.includes("--apply");

async function gql(q, v = {}) {
  const r = await fetch(GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query: q, variables: v }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}
async function restGet(key) {
  const r = await fetch(`${REST}?asset[key]=${encodeURIComponent(key)}`, {
    headers: { "X-Shopify-Access-Token": TOKEN },
  });
  if (!r.ok) throw new Error(`GET ${key}: ${r.status}`);
  return (await r.json()).asset?.value;
}
async function restPut(key, value) {
  const r = await fetch(REST, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ asset: { key, value } }),
  });
  if (!r.ok) throw new Error(`PUT ${key}: ${r.status} — ${await r.text()}`);
  return await r.json();
}

// ─── Step 0: discover the 3 target translatable items ───
console.log("Step 0: locate 3 View-all targets…");
const d0 = await gql(`{
  translatableResources(first: 5, resourceType: ONLINE_STORE_THEME) {
    edges { node { resourceId translatableContent { key value digest } } }
  }
}`);
const themeRes = d0.translatableResources.edges
  .map(e => e.node)
  .find(n => n.resourceId === RESOURCE_ID);
const targets = themeRes.translatableContent.filter(c =>
  c.value === "عرض الكل" && c.key.includes("product_list_button") && c.key.includes(".label:")
);
console.log(`  found ${targets.length} target(s)`);
if (targets.length !== 3) {
  console.error(`  ❌ Expected 3, got ${targets.length} — aborting`);
  process.exit(1);
}
for (const t of targets) console.log(`  - ${t.key.slice(0, 95)}…`);

// ─── Step 1: register AR translations (safe — no visual change) ───
console.log("\nStep 1: register AR translations = 'عرض الكل' for these keys");
const arTranslations = targets.map(t => ({
  key: t.key,
  value: "عرض الكل",
  locale: "ar",
  translatableContentDigest: t.digest,
}));

if (!APPLY) {
  console.log(`  (dry-run) would register ${arTranslations.length} AR translations`);
} else {
  const r = await gql(`
    mutation Reg($resourceId: ID!, $translations: [TranslationInput!]!) {
      translationsRegister(resourceId: $resourceId, translations: $translations) {
        translations { key value locale }
        userErrors { field message }
      }
    }`, { resourceId: RESOURCE_ID, translations: arTranslations });
  const errs = r.translationsRegister.userErrors;
  if (errs.length) {
    console.error("  ❌ AR registration failed:");
    for (const e of errs) console.error(`     [${e.field?.join(".")}] ${e.message}`);
    process.exit(1);
  }
  console.log(`  ✅ Registered ${r.translationsRegister.translations.length} AR translation(s)`);
}

// ─── Step 2: PUT updated templates/index.json with English source ───
console.log("\nStep 2: rewrite templates/index.json source 'عرض الكل' → 'View all'");
const tplOriginal = await restGet("templates/index.json");
const occurrences = tplOriginal.split("عرض الكل").length - 1;
console.log(`  current occurrences in templates/index.json: ${occurrences}`);
if (occurrences === 0) {
  console.log("  ✅ Already migrated (source = English).");
  process.exit(0);
}
if (occurrences !== 3) {
  console.error(`  ❌ Expected 3 occurrences, got ${occurrences} — aborting (manual review needed)`);
  process.exit(1);
}

if (!APPLY) {
  console.log(`  (dry-run) would replace 3 × "عرض الكل" → "View all" in templates/index.json`);
  console.log("\nℹ️  Dry-run only. Re-run with --apply to push to Shopify.");
  process.exit(0);
}

// Backup
const backupPath = `/tmp/templates-index.json.bak-${Date.now()}`;
writeFileSync(backupPath, tplOriginal);
console.log(`  ✅ Backup: ${backupPath}`);

const tplPatched = tplOriginal.replaceAll("عرض الكل", "View all");
const newOccurrences = tplPatched.split("عرض الكل").length - 1;
const enOccurrences = tplPatched.split("View all").length - 1;
console.log(`  after patch: 'عرض الكل' x${newOccurrences}, 'View all' x${enOccurrences}`);

await restPut("templates/index.json", tplPatched);
console.log("  ✅ templates/index.json updated");

// ─── Step 3: verify ───
console.log("\nStep 3: verify both locales render correctly");
console.log("  Wait 5s for Shopify cache to settle…");
await new Promise(r => setTimeout(r, 5000));

async function checkLocale(url, expectViewAll, expectArabic) {
  const r = await fetch(url + "?_cb=" + Date.now(), {
    headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": url.includes("/en-us") ? "en-US" : "ar" },
  });
  const html = await r.text();
  const hasViewAll = html.includes("View all");
  const hasArabic = html.includes("عرض الكل");
  const ok = (hasViewAll === expectViewAll) && (hasArabic === expectArabic);
  console.log(`  ${ok ? "✅" : "⚠️ "} ${url}`);
  console.log(`     "View all" present: ${hasViewAll}  (expected ${expectViewAll})`);
  console.log(`     "عرض الكل" present: ${hasArabic}  (expected ${expectArabic})`);
  return ok;
}
await checkLocale("https://bluemarineatelier.com/en-us/", true, false);
await checkLocale("https://bluemarineatelier.com/", false, true);

console.log("\n📝 Note: due to Shopify CDN cache, full propagation may take 1–5 min.");
console.log(`📝 Rollback if needed: PUT /tmp/templates-index.json.bak-* back to templates/index.json`);
