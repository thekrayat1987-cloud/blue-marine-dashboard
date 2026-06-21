#!/usr/bin/env node
/**
 * Stronger fix for cart-drawer X overlap on mobile.
 *
 * Adds:
 *   - explicit min-height so header doesn't collapse
 *   - bigger top padding + gap on mobile
 *   - relative-positioned close button so it sits properly in flex
 *   - safe-area-inset-top on iOS so it doesn't sit under the notch
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
  resolve(backupDir, `cart-drawer.liquid.${new Date().toISOString().replace(/[:.]/g, "-")}.headerfix2.bak`),
  drawer,
  "utf8"
);

// Replace the entire current header rule (which already has my earlier fix) with a stronger version
const OLD = `  .cart-drawer__header {
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
    z-index: 1;

    @media screen and (min-width: 750px) {
      padding: var(--cart-drawer-padding-desktop);
    }
  }`;

const NEW = `  .cart-drawer__header {
    background-color: var(--color-background);
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 24px 20px 16px;
    padding-top: calc(24px + env(safe-area-inset-top, 0px));
    gap: 24px;
    min-height: 64px;
    border-bottom: var(--style-border-width) solid none;
    position: sticky;
    top: 0;
    z-index: 1;
    box-sizing: border-box;

    @media screen and (min-width: 750px) {
      padding: 28px 28px 20px;
      padding-top: 28px;
      min-height: 72px;
    }
  }

  .cart-drawer__close-button {
    flex-shrink: 0;
    position: relative;
    z-index: 2;
    width: 36px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .cart-drawer__heading {
    margin: 0;
    line-height: 1.2;
    flex: 1;
    min-width: 0;
  }`;

if (!drawer.includes(OLD)) {
  console.error("❌ Old header block not found — was the v1 patch applied? Schema may differ.");
  // Helpful: show what's currently there
  const m = drawer.match(/\.cart-drawer__header \{[^}]+\}/s);
  if (m) console.log("Current rule:\n" + m[0]);
  process.exit(1);
}
if (drawer.includes("min-height: 64px")) {
  console.log("⚠️  v2 already applied — no-op.");
  process.exit(0);
}

const updated = drawer.replace(OLD, NEW);
const res = await put("snippets/cart-drawer.liquid", updated);
if (res.errors) { console.error("❌", res.errors); process.exit(1); }
console.log("✅ Stronger header fix deployed");

// Cache bust
const theme = await get("layout/theme.liquid");
if (theme) {
  await put("layout/theme.liquid", theme);
  console.log("✅ Cache busted");
}
