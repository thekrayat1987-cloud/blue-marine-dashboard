#!/usr/bin/env node
/**
 * Patch incorrect / missing AR translations in the active theme's
 * locales/ar.json — focused on inventory + filter strings that
 * Khadija saw still in English (or wrongly translated as "في الأوراق المالية").
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
const REST = `https://${STORE}/admin/api/${VERSION}/themes/${THEME_ID}/assets.json`;

// Fix list: dotted-path → correct AR string
const FIXES = {
  // 🔴 critical mistranslation: "في الأوراق المالية" = "in financial securities"
  "content.inventory_in_stock": "متوفر",
  // 🔴 weird phrasing: "إنتهى من المخزن"
  "content.inventory_out_of_stock": "غير متوفر",
  // 🔴 still English in ar.json
  "content.price_range": "نطاق السعر",
  "content.inventory_low_stock_show_count.one": "تبقى {{ count }}",
  "content.inventory_low_stock_show_count.other": "تبقى {{ count }}",
  // a couple more catches we might want:
  "content.volume_pricing_available": "تسعير الكميات متاح",
};

async function getAsset(key) {
  const r = await fetch(`${REST}?asset[key]=${encodeURIComponent(key)}`, {
    headers: { "X-Shopify-Access-Token": TOKEN },
  });
  if (!r.ok) {
    console.error(`Failed to fetch ${key}: ${r.status}`);
    return null;
  }
  const j = await r.json();
  return j.asset?.value ?? null;
}

async function putAsset(key, value) {
  const r = await fetch(REST, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ asset: { key, value } }),
  });
  const j = await r.json();
  if (!r.ok || j.errors) {
    console.error(`PUT failed:`, JSON.stringify(j).slice(0, 400));
    return false;
  }
  return true;
}

function setByPath(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] === undefined || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}
function getByPath(obj, path) {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) cur = cur?.[p];
  return cur;
}

const arRaw = await getAsset("locales/ar.json");
if (!arRaw) process.exit(1);
const ar = JSON.parse(arRaw);

console.log("📋 Before:");
for (const [path, newVal] of Object.entries(FIXES)) {
  console.log(`   ${path} = ${JSON.stringify(getByPath(ar, path))}`);
}

for (const [path, newVal] of Object.entries(FIXES)) {
  setByPath(ar, path, newVal);
}

console.log("\n✏️  After:");
for (const [path, newVal] of Object.entries(FIXES)) {
  console.log(`   ${path} = ${JSON.stringify(getByPath(ar, path))}`);
}

const newRaw = JSON.stringify(ar, null, 2);
console.log(`\n📦 Sending updated ar.json (${newRaw.length} chars) → theme ${THEME_ID}…`);
const ok = await putAsset("locales/ar.json", newRaw);
console.log(ok ? "✅ ar.json updated" : "❌ PUT failed");

// Bust page cache by re-touching theme.liquid
if (ok) {
  console.log("\n🔄 Touching layout/theme.liquid to bust page cache…");
  const tl = await getAsset("layout/theme.liquid");
  if (tl) {
    const stamped = tl.replace(/<!-- locale-bust:[0-9]+ -->/g, "");
    const bust = `<!-- locale-bust:${Date.now()} -->\n${stamped}`;
    const ok2 = await putAsset("layout/theme.liquid", bust);
    console.log(ok2 ? "✅ theme.liquid touched" : "⚠️  theme.liquid touch failed");
  }
}
