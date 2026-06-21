#!/usr/bin/env node
/**
 * READ-ONLY inspection of theme.liquid (and related layout files) to find
 * any code that forces Arabic / RTL regardless of request.locale.
 *
 * Output: highlights every line containing locale, lang=, dir=, rtl, "ar",
 * and Liquid expressions related to language.
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
  if (!r.ok) return null;
  const j = await r.json();
  return j.asset?.value ?? null;
}

const KEYS_TO_INSPECT = [
  "layout/theme.liquid",
  "layout/password.liquid",
  "snippets/meta-tags.liquid",
];

for (const key of KEYS_TO_INSPECT) {
  console.log(`\n━━━ ${key} ━━━`);
  const content = await getAsset(key);
  if (!content) {
    console.log("  (not found)");
    continue;
  }
  // Save full file for later inspection
  const fname = `/tmp/${key.replace(/[\/]/g, "_")}`;
  writeFileSync(fname, content);
  console.log(`  saved to ${fname}  (${content.length} bytes)`);

  // Surface suspicious lines
  const lines = content.split("\n");
  const matchRe = /lang=|dir=|rtl|request\.locale|shop\.locale|"ar"|'ar'|forceArabic|locale\.iso/i;
  let found = 0;
  for (let i = 0; i < lines.length; i++) {
    if (matchRe.test(lines[i])) {
      console.log(`  L${i + 1}: ${lines[i].trim().slice(0, 140)}`);
      found++;
      if (found >= 30) { console.log("  …(truncated)"); break; }
    }
  }
  if (found === 0) console.log("  (no suspicious lines)");
}
