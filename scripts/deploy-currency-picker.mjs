#!/usr/bin/env node
/**
 * Deploy the Blue Marine currency picker:
 *   1) Push snippets/currency-picker.liquid
 *   2) Patch snippets/header-actions.liquid to render it
 *   3) Bust theme.liquid cache
 *
 * Dry-run: node scripts/deploy-currency-picker.mjs
 * Apply:   node scripts/deploy-currency-picker.mjs --apply
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
const REST = `https://${STORE}/admin/api/${VERSION}/themes/182480240940/assets.json`;
const APPLY = process.argv.includes("--apply");

async function get(key) {
  const r = await fetch(REST + "?asset[key]=" + encodeURIComponent(key), {
    headers: { "X-Shopify-Access-Token": TOKEN },
  });
  return (await r.json()).asset?.value;
}
async function put(key, value) {
  const r = await fetch(REST, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ asset: { key, value } }),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error(JSON.stringify(j).slice(0, 500));
  return j;
}

const SNIPPET_LOCAL = resolve(__dirname, "..", "..", "shopify-snippets", "currency-picker.liquid");
const snippetSrc = readFileSync(SNIPPET_LOCAL, "utf8");

// ─── 1) Snippet ──────────────────────────────────────────────────────
console.log("─── currency-picker.liquid ───");
console.log(`  Local size: ${snippetSrc.length} chars`);
if (APPLY) {
  await put("snippets/currency-picker.liquid", snippetSrc);
  console.log("  ✅ pushed");
} else {
  console.log("  (dry-run)");
}

// ─── 2) Patch header-actions.liquid ──────────────────────────────────
console.log("\n─── header-actions.liquid patch ───");
const HEADER_KEY = "snippets/header-actions.liquid";
const headerOrig = await get(HEADER_KEY);
if (!headerOrig) throw new Error(`Could not fetch ${HEADER_KEY}`);
writeFileSync(resolve(__dirname, "..", "header-actions.liquid.bak"), headerOrig);

const MARKER = "<header-actions\n  {{- block.shopify_attributes -}}\n>";
const PICKER_RENDER = `<header-actions
  {{- block.shopify_attributes -}}
>
  {% render 'currency-picker' %}`;

let headerNext = headerOrig;
if (headerOrig.includes("{% render 'currency-picker' %}")) {
  console.log("  ⏭  already patched");
} else if (headerOrig.includes(MARKER)) {
  headerNext = headerOrig.replace(MARKER, PICKER_RENDER);
  console.log("  ✏️  inserted currency-picker render after <header-actions>");
} else {
  throw new Error("Marker not found in header-actions.liquid — manual review needed");
}

if (headerNext !== headerOrig) {
  if (APPLY) {
    await put(HEADER_KEY, headerNext);
    console.log("  ✅ pushed");
  } else {
    console.log("  (dry-run)");
  }
}

// ─── 3) Bust theme.liquid cache ──────────────────────────────────────
console.log("\n─── theme.liquid cache bust ───");
const tl = await get("layout/theme.liquid");
const stamped = tl.replace(/<!-- locale-bust:[0-9]+ -->\n?/g, "");
const newTl = `<!-- locale-bust:${Date.now()} -->\n${stamped}`;
if (APPLY) {
  await put("layout/theme.liquid", newTl);
  console.log("  ✅ touched theme.liquid");
} else {
  console.log("  (dry-run)");
}

console.log("\n" + (APPLY ? "✅ Deployment complete." : "ℹ️  Dry-run only. Re-run with --apply to push."));
