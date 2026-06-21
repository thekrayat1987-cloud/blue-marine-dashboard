#!/usr/bin/env node
/**
 * Style the cart-drawer close (X) button as a visible navy circle
 * with the X icon inside, matching brand.
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
const THEME_ID = 182480240940;

async function get(k) {
  const r = await fetch(`https://${STORE}/admin/api/${VERSION}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(k)}`, { headers: { "X-Shopify-Access-Token": TOKEN } });
  return (await r.json()).asset?.value;
}
async function put(k, v) {
  const r = await fetch(`https://${STORE}/admin/api/${VERSION}/themes/${THEME_ID}/assets.json`, {
    method: "PUT", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ asset: { key: k, value: v } }),
  });
  return r.json();
}

const drawer = await get("snippets/cart-drawer.liquid");

const OLD = `  .cart-drawer__close-button {
    flex-shrink: 0;
    position: relative;
    z-index: 2;
    width: 44px;
    height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    align-self: center;
    margin: 0;
    padding: 0;
  }`;

const NEW = `  .cart-drawer__close-button {
    flex-shrink: 0;
    position: relative;
    z-index: 2;
    width: 40px;
    height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    align-self: center;
    margin: 0;
    padding: 0;
    border-radius: 50%;
    border: 1.5px solid #173057;
    background: transparent;
    color: #173057;
    transition: background 0.2s ease, color 0.2s ease;
    cursor: pointer;
  }
  .cart-drawer__close-button:hover,
  .cart-drawer__close-button:focus-visible {
    background: #173057;
    color: #ffffff;
    outline: none;
  }
  .cart-drawer__close-button .svg-wrapper {
    display: inline-flex;
    width: 14px;
    height: 14px;
    align-items: center;
    justify-content: center;
  }
  .cart-drawer__close-button svg {
    width: 14px;
    height: 14px;
    stroke: currentColor;
    fill: none;
    stroke-width: 1.5;
  }`;

if (!drawer.includes(OLD)) {
  console.error("❌ Close-button v3 block not found");
  process.exit(1);
}
if (drawer.includes("border: 1.5px solid #173057")) {
  console.log("⚠️  Circle styling already applied");
  process.exit(0);
}

const updated = drawer.replace(OLD, NEW);
const res = await put("snippets/cart-drawer.liquid", updated);
if (res.errors) { console.error("❌", res.errors); process.exit(1); }
console.log("✅ X close button styled as navy circle (40px, 1.5px border, hover fills navy)");

const theme = await get("layout/theme.liquid");
if (theme) {
  await put("layout/theme.liquid", theme);
  console.log("✅ Cache busted");
}
