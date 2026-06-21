#!/usr/bin/env node
/**
 * Audit theme locales: fetch en.default.json + ar.json from active theme
 * and report keys missing or still in English in ar.json — focused on
 * collection sort, filter/facet, and availability strings.
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
const REST = `https://${STORE}/admin/api/${VERSION}/themes/${THEME_ID}/assets.json`;

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

const enRaw = await getAsset("locales/en.default.json");
const arRaw = await getAsset("locales/ar.json");

if (!enRaw || !arRaw) {
  console.error("Missing one of the locale files");
  process.exit(1);
}

const en = JSON.parse(enRaw);
const ar = JSON.parse(arRaw);

writeFileSync(resolve(__dirname, "..", "theme-en.json"), enRaw);
writeFileSync(resolve(__dirname, "..", "theme-ar.json"), arRaw);
console.log(`✅ Saved theme-en.json (${enRaw.length} chars) and theme-ar.json (${arRaw.length} chars)`);

// Walk both objects in parallel and compare
function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flatten(v, path));
    } else {
      out[path] = v;
    }
  }
  return out;
}

const flatEn = flatten(en);
const flatAr = flatten(ar);

const missing = [];
const sameAsEnglish = [];
for (const [key, enVal] of Object.entries(flatEn)) {
  const arVal = flatAr[key];
  if (arVal === undefined || arVal === null || arVal === "") {
    missing.push({ key, en: enVal });
  } else if (typeof enVal === "string" && typeof arVal === "string" && enVal === arVal && /[a-zA-Z]/.test(enVal)) {
    sameAsEnglish.push({ key, en: enVal, ar: arVal });
  }
}

// Filter focus areas (sort/filter/facet/availability)
const FOCUS_PATTERN = /sort|filter|facet|availability|in_stock|out_of_stock|stock|price_range|reset|clear|date|alphabetical|best_selling|featured|relevance/i;
const focusMissing = missing.filter((m) => FOCUS_PATTERN.test(m.key));
const focusSame = sameAsEnglish.filter((m) => FOCUS_PATTERN.test(m.key));

console.log(`\n📊 Total keys: en=${Object.keys(flatEn).length}, ar=${Object.keys(flatAr).length}`);
console.log(`📊 Missing in ar.json: ${missing.length}`);
console.log(`📊 Same as English in ar.json: ${sameAsEnglish.length}`);
console.log(`\n🎯 FOCUS — Missing (sort/filter/stock):  ${focusMissing.length}`);
for (const m of focusMissing) console.log(`   [MISSING] ${m.key}  =  "${m.en}"`);
console.log(`\n🎯 FOCUS — Same as English (sort/filter/stock):  ${focusSame.length}`);
for (const m of focusSame) console.log(`   [EN==AR]  ${m.key}  =  "${m.en}"`);

writeFileSync(
  resolve(__dirname, "..", "theme-locale-audit.json"),
  JSON.stringify({ missing, sameAsEnglish, focusMissing, focusSame }, null, 2),
);
console.log(`\n💾 Wrote theme-locale-audit.json`);
