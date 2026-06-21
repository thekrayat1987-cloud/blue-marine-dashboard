#!/usr/bin/env node
/**
 * v3: align X close button to the heading's visual center.
 *
 * The h2 heading has large line-height making its box much taller
 * than the 36px X circle, so flex center put X at the top of the
 * heading text instead of centered. Fix: tighten heading line-height,
 * bump X to 44px (standard mobile tap target), and align baseline.
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
  const r = await fetch(`https://${STORE}/admin/api/${VERSION}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(k)}`, { headers: { "X-Shopify-Access-Token": TOKEN } });
  return (await r.json()).asset?.value;
}
async function put(k, v) {
  const r = await fetch(`https://${STORE}/admin/api/${VERSION}/themes/${THEME_ID}/assets.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ asset: { key: k, value: v } }),
  });
  return r.json();
}

const drawer = await get("snippets/cart-drawer.liquid");
const backupDir = resolve(__dirname, "..", "..", "shopify-snippets", "backups");
if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
writeFileSync(
  resolve(backupDir, `cart-drawer.liquid.${new Date().toISOString().replace(/[:.]/g, "-")}.headerfix3.bak`),
  drawer,
  "utf8"
);

// Replace v2 block with v3 (more careful alignment)
const OLD_CLOSE = `  .cart-drawer__close-button {
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

const NEW_CLOSE = `  .cart-drawer__close-button {
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
  }

  .cart-drawer__heading {
    margin: 0;
    padding: 0;
    line-height: 1;
    flex: 1;
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }

  .cart-drawer__heading .cart-bubble {
    vertical-align: middle;
    align-self: center;
  }`;

if (!drawer.includes(OLD_CLOSE)) {
  console.error("❌ v2 block not found — did you apply v2 first?");
  process.exit(1);
}
if (drawer.includes("align-self: center;\n    margin: 0;\n    padding: 0;")) {
  console.log("⚠️  v3 already applied — no-op.");
  process.exit(0);
}

const updated = drawer.replace(OLD_CLOSE, NEW_CLOSE);
const res = await put("snippets/cart-drawer.liquid", updated);
if (res.errors) { console.error("❌", res.errors); process.exit(1); }
console.log("✅ v3 alignment fix deployed (heading + X aligned center, h2 tight line-height)");

const theme = await get("layout/theme.liquid");
if (theme) {
  await put("layout/theme.liquid", theme);
  console.log("✅ Cache busted");
}
