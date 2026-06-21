#!/usr/bin/env node
/**
 * Patch cart-drawer.liquid header CSS to prevent the close (X) button
 * from visually overlapping the "عربة التسوق" heading.
 *
 * Fix: extra padding-top + explicit gap between title and close button.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
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
const THEME_ID = 182480240940;

async function get(k) {
  const r = await fetch(
    `https://${STORE}/admin/api/${VERSION}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(k)}`,
    { headers: { "X-Shopify-Access-Token": TOKEN } }
  );
  return (await r.json()).asset?.value;
}
async function put(k, v) {
  const r = await fetch(
    `https://${STORE}/admin/api/${VERSION}/themes/${THEME_ID}/assets.json`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
      body: JSON.stringify({ asset: { key: k, value: v } }),
    }
  );
  return r.json();
}

const drawer = await get("snippets/cart-drawer.liquid");
const backupDir = resolve(__dirname, "..", "..", "shopify-snippets", "backups");
if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
writeFileSync(
  resolve(backupDir, `cart-drawer.liquid.${new Date().toISOString().replace(/[:.]/g, "-")}.headerfix.bak`),
  drawer,
  "utf8"
);

const marker = `  .cart-drawer__header {
    background-color: var(--color-background);
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: var(--cart-drawer-padding);
    border-bottom: var(--style-border-width) solid none;
    position: sticky;
    top: 0;
    z-index: 1;`;

const replacement = `  .cart-drawer__header {
    background-color: var(--color-background);
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: var(--cart-drawer-padding);
    padding-top: calc(var(--cart-drawer-padding, 16px) + 14px);
    gap: 16px;
    border-bottom: var(--style-border-width) solid none;
    position: sticky;
    top: 0;
    z-index: 1;`;

if (drawer.includes("padding-top: calc(var(--cart-drawer-padding")) {
  console.log("⚠️  Header spacing fix already present — no-op.");
} else if (!drawer.includes(marker)) {
  console.error("❌ Marker for header block not found — manual review needed.");
  process.exit(1);
} else {
  const updated = drawer.replace(marker, replacement);
  const res = await put("snippets/cart-drawer.liquid", updated);
  if (res.errors) {
    console.error("❌ PUT failed:", JSON.stringify(res.errors));
    process.exit(1);
  }
  console.log("✅ Added padding-top + gap to .cart-drawer__header");
}

// Touch theme.liquid for cache bust
const themeLayout = await get("layout/theme.liquid");
if (themeLayout) {
  await put("layout/theme.liquid", themeLayout);
  console.log("✅ Cache busted");
}
