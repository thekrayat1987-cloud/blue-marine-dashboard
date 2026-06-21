#!/usr/bin/env node
/**
 * Triple investigation:
 *   1. Find "View all" / "عرض الكل" occurrences in theme templates + sections + JSON config
 *   2. Audit how many products have EN translations (title minimum)
 *   3. List installed apps (to identify the social-proof popup)
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
const THEME_ID = "182480240940";
const REST = `https://${STORE}/admin/api/${VERSION}`;
const GRAPHQL = `${REST}/graphql.json`;

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

async function listThemeAssets() {
  const r = await fetch(`${REST}/themes/${THEME_ID}/assets.json`, {
    headers: { "X-Shopify-Access-Token": TOKEN },
  });
  const j = await r.json();
  return j.assets || [];
}

async function getAsset(key) {
  const r = await fetch(`${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`, {
    headers: { "X-Shopify-Access-Token": TOKEN },
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j.asset?.value ?? null;
}

// ─────────────────────────────────────────────────────────────
// 1) Find "View all" / "عرض الكل" occurrences
// ─────────────────────────────────────────────────────────────
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("1️⃣  Searching for 'View all' / 'عرض الكل' in theme");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
const assets = await listThemeAssets();
const SCAN_PATTERNS = ["templates/", "sections/", "locales/", "config/"];
const targets = assets.filter(a => SCAN_PATTERNS.some(p => a.key.startsWith(p)));
console.log(`Scanning ${targets.length} theme files...`);
let viewAllHits = 0;
for (const a of targets) {
  const content = await getAsset(a.key);
  if (!content) continue;
  if (content.includes("عرض الكل") || /View all/i.test(content)) {
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("عرض الكل") || /View all/i.test(lines[i])) {
        console.log(`  📄 ${a.key}  L${i + 1}`);
        console.log(`     ${lines[i].trim().slice(0, 160)}`);
        viewAllHits++;
        if (viewAllHits >= 30) break;
      }
    }
  }
  if (viewAllHits >= 30) { console.log("  …(truncated)"); break; }
}
if (viewAllHits === 0) console.log("  (no occurrences found)");

// ─────────────────────────────────────────────────────────────
// 2) Audit EN translation coverage on products
// ─────────────────────────────────────────────────────────────
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("2️⃣  EN translation coverage on products");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
let cursor = null;
let total = 0, withEnTitle = 0, withoutEnTitle = 0;
const missing = [];
while (true) {
  const d = await gql(`query($cursor:String){
    products(first:50, after:$cursor){
      pageInfo{ hasNextPage endCursor }
      edges{ node{
        id title
        translations(locale:"en") { key value }
      }}
    }
  }`, { cursor });
  for (const e of d.products.edges) {
    total++;
    const t = e.node.translations.find(x => x.key === "title");
    if (t && t.value) withEnTitle++;
    else { withoutEnTitle++; if (missing.length < 15) missing.push(e.node.title); }
  }
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}
console.log(`Total products: ${total}`);
console.log(`  ✅ With EN title translation: ${withEnTitle}`);
console.log(`  ❌ WITHOUT EN title translation: ${withoutEnTitle}`);
if (missing.length) {
  console.log(`  Sample missing (first ${missing.length}):`);
  for (const m of missing) console.log(`    - ${m}`);
}

// ─────────────────────────────────────────────────────────────
// 3) List installed apps (for social-proof identification)
// ─────────────────────────────────────────────────────────────
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("3️⃣  Installed apps (for social-proof identification)");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
try {
  const r = await fetch(`${REST}/app_installations.json`, {
    headers: { "X-Shopify-Access-Token": TOKEN },
  });
  const j = await r.json();
  if (j.app_installations) {
    for (const a of j.app_installations) {
      console.log(`  - ${a.app?.name || a.app_id} ${a.app?.handle ? `(${a.app.handle})` : ""}`);
    }
  } else {
    console.log("  (app_installations endpoint requires read_apps scope, fallback...)");
    // Fallback: list script tags + ext blocks
    const st = await fetch(`${REST}/script_tags.json`, {
      headers: { "X-Shopify-Access-Token": TOKEN },
    });
    const stj = await st.json();
    if (stj.script_tags) {
      console.log("  Script tags (from apps):");
      for (const s of stj.script_tags) console.log(`    - ${s.src}`);
    }
  }
} catch (e) {
  console.log("  (could not list apps:", e.message, ")");
}

// Also search the theme for "viewing now" / "just bought" markers
console.log("\n  Searching theme for social-proof popup markers...");
const SOCIAL_PROOF_MARKERS = ["viewing now", "just bought", "viewing-now", "social-proof", "salespop", "prove", "fomo"];
let popupHits = 0;
for (const a of assets) {
  const content = await getAsset(a.key);
  if (!content) continue;
  for (const marker of SOCIAL_PROOF_MARKERS) {
    if (content.toLowerCase().includes(marker)) {
      console.log(`    📄 ${a.key}  matches "${marker}"`);
      popupHits++;
      break;
    }
  }
  if (popupHits >= 10) { console.log("    …(truncated)"); break; }
}
if (popupHits === 0) console.log("    (no social-proof markers in theme — likely external app via script tag)");
