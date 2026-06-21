#!/usr/bin/env node
/**
 * Patch snippets/sorting.liquid: the sort dropdown popover uses
 * `right: 0` (physical), which in RTL keeps it anchored to the right
 * while the button is on the left, causing the popover to overflow
 * off the left edge of the viewport. Add an [dir="rtl"] override
 * that anchors it to the left instead.
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
const KEY = "snippets/sorting.liquid";

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
  if (!r.ok || j.errors) throw new Error(JSON.stringify(j).slice(0, 400));
  return j;
}

const orig = await get(KEY);
if (!orig) throw new Error(`Could not fetch ${KEY}`);

writeFileSync(resolve(__dirname, "..", "sorting.liquid.bak"), orig);

const MARKER = "/* RTL popover overflow fix */";
if (orig.includes(MARKER)) {
  console.log("⏭  Already patched. Aborting.");
  process.exit(0);
}

// Inject before {% endstylesheet %} at end of file
const insertion = `
  ${MARKER}
  [dir="rtl"] .sorting-filter__options {
    right: unset;
    left: 0;
  }
`;

const anchor = "{% endstylesheet %}";
if (!orig.includes(anchor)) throw new Error("endstylesheet anchor not found");
const next = orig.replace(anchor, insertion + anchor);

console.log(`📦 PUT updated ${KEY} (${next.length} chars vs ${orig.length})…`);
await put(KEY, next);
console.log("✅ sorting.liquid patched");

// Bust page cache
const tl = await get("layout/theme.liquid");
const stamped = tl.replace(/<!-- locale-bust:[0-9]+ -->\n?/g, "");
await put("layout/theme.liquid", `<!-- locale-bust:${Date.now()} -->\n${stamped}`);
console.log("✅ theme.liquid touched");
