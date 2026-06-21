#!/usr/bin/env node
/**
 * Fix the social-proof popup so it fetches /products.json on the CURRENT
 * locale path instead of the root (which falls back to AR).
 *
 * One-line change in snippets/blue-marine-social-proof.liquid:
 *   - fetch('/products.json?limit=50')
 *   + fetch(((window.Shopify && Shopify.routes && Shopify.routes.root) || '/') + 'products.json?limit=50')
 *
 * Backs up the original to /tmp/social-proof.liquid.bak-<timestamp> before PUT.
 *
 * Dry-run: node scripts/fix-social-proof-locale.mjs
 * Apply:   node scripts/fix-social-proof-locale.mjs --apply
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
const KEY = "snippets/blue-marine-social-proof.liquid";
const REST = `https://${STORE}/admin/api/${VERSION}/themes/${THEME_ID}/assets.json`;
const APPLY = process.argv.includes("--apply");

const OLD = "fetch('/products.json?limit=50')";
const NEW = "fetch(((window.Shopify && Shopify.routes && Shopify.routes.root) || '/') + 'products.json?limit=50')";

// 1) Fetch current content
const r = await fetch(`${REST}?asset[key]=${encodeURIComponent(KEY)}`, {
  headers: { "X-Shopify-Access-Token": TOKEN },
});
if (!r.ok) {
  console.error(`Failed to fetch ${KEY}: ${r.status}`);
  process.exit(1);
}
const content = (await r.json()).asset?.value;
if (!content) {
  console.error("Empty content");
  process.exit(1);
}

// 2) Verify the OLD string is present (only once)
const occurrences = content.split(OLD).length - 1;
if (occurrences === 0) {
  console.log(`✅ Fix already applied — old fetch pattern not found.`);
  process.exit(0);
}
if (occurrences > 1) {
  console.error(`❌ Refusing to apply: OLD pattern appears ${occurrences} times (expected 1)`);
  process.exit(1);
}

console.log(`Found 1 occurrence of OLD pattern in ${KEY}`);
console.log(`OLD: ${OLD}`);
console.log(`NEW: ${NEW}`);
console.log();

if (!APPLY) {
  // Save preview
  const preview = content.replace(OLD, NEW);
  writeFileSync("/tmp/social-proof.preview.liquid", preview);
  console.log("Preview saved to /tmp/social-proof.preview.liquid");
  console.log("ℹ️  Dry-run only. Re-run with --apply to push to Shopify.");
  process.exit(0);
}

// 3) Backup ORIGINAL before any change
const backupPath = `/tmp/social-proof.liquid.bak-${Date.now()}`;
writeFileSync(backupPath, content);
console.log(`✅ Original backed up to ${backupPath}`);

// 4) Apply change
const newContent = content.replace(OLD, NEW);

// Sanity: ensure the file actually changed
if (newContent === content) {
  console.error("❌ Replace produced identical content — aborting");
  process.exit(1);
}

// 5) PUT it back
const putR = await fetch(REST, {
  method: "PUT",
  headers: {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": TOKEN,
  },
  body: JSON.stringify({
    asset: { key: KEY, value: newContent },
  }),
});

if (!putR.ok) {
  const txt = await putR.text();
  console.error(`❌ PUT failed: ${putR.status}`);
  console.error(txt);
  console.error(`Restore from backup: ${backupPath}`);
  process.exit(1);
}

const putJson = await putR.json();
console.log(`✅ Snippet updated. Size: ${putJson.asset?.size || "?"} bytes`);
console.log(`Backup: ${backupPath}`);
