#!/usr/bin/env node
/**
 * Deploy cart-upsell-bisht.liquid to live theme + inject render into main-cart.liquid.
 *
 * Steps:
 *  1. Upload snippets/cart-upsell-bisht.liquid (new file, safe)
 *  2. Read current sections/main-cart.liquid, back up to ../shopify-snippets/backups/
 *  3. Inject {% render 'cart-upsell-bisht' %} between cart items and summary
 *  4. Push modified main-cart.liquid
 *  5. Touch layout/theme.liquid to bust page_cache
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

async function getAsset(key) {
  const r = await fetch(
    `https://${STORE}/admin/api/${VERSION}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { "X-Shopify-Access-Token": TOKEN } }
  );
  const j = await r.json();
  return j.asset?.value;
}

async function putAsset(key, value) {
  const r = await fetch(
    `https://${STORE}/admin/api/${VERSION}/themes/${THEME_ID}/assets.json`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": TOKEN,
      },
      body: JSON.stringify({ asset: { key, value } }),
    }
  );
  const j = await r.json();
  if (j.errors) {
    console.error(`❌ PUT ${key} failed:`, JSON.stringify(j.errors));
    process.exit(1);
  }
  return j.asset;
}

const backupDir = resolve(__dirname, "..", "..", "shopify-snippets", "backups");
if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

// 1) Upload snippet
console.log("→ Uploading snippets/cart-upsell-bisht.liquid…");
const snippetSrc = readFileSync(
  resolve(__dirname, "..", "..", "shopify-snippets", "cart-upsell-bisht.liquid"),
  "utf8"
);
await putAsset("snippets/cart-upsell-bisht.liquid", snippetSrc);
console.log("  ✅ snippet uploaded");

// 2) Read + back up main-cart.liquid
console.log("\n→ Reading current sections/main-cart.liquid…");
const cartSec = await getAsset("sections/main-cart.liquid");
if (!cartSec) {
  console.error("❌ Could not fetch sections/main-cart.liquid");
  process.exit(1);
}
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = resolve(backupDir, `main-cart.liquid.${ts}.bak`);
writeFileSync(backupPath, cartSec, "utf8");
console.log(`  ✅ backed up to ${backupPath}`);

// 3) Inject — find the line that closes cart-page__items and inject our render before summary block
const marker = `      </div>

      {%- unless cart.empty? -%}
        <div class="cart-page__summary">`;
if (cartSec.includes("cart-upsell-bisht")) {
  console.log("\n⚠️  cart-upsell-bisht render already present — skipping injection (snippet file already updated above)");
} else if (!cartSec.includes(marker)) {
  console.error("❌ Insertion marker not found in main-cart.liquid — schema may have changed");
  process.exit(1);
} else {
  const injection = `      </div>

      {%- unless cart.empty? -%}
        <div class="cart-page__upsell">
          {%- render 'cart-upsell-bisht' -%}
        </div>

        <div class="cart-page__summary">`;
  const updated = cartSec.replace(marker, injection);

  console.log("\n→ Pushing modified sections/main-cart.liquid…");
  await putAsset("sections/main-cart.liquid", updated);
  console.log("  ✅ injection deployed");
}

// 3.5) Inject into cart-drawer.liquid (the popup)
console.log("\n→ Reading current snippets/cart-drawer.liquid…");
const drawer = await getAsset("snippets/cart-drawer.liquid");
if (!drawer) {
  console.error("❌ Could not fetch snippets/cart-drawer.liquid");
  process.exit(1);
}
const drawerBackup = resolve(backupDir, `cart-drawer.liquid.${ts}.bak`);
writeFileSync(drawerBackup, drawer, "utf8");
console.log(`  ✅ backed up to ${drawerBackup}`);

const drawerMarker = `            </scroll-hint>

            <div
              class="cart-drawer__summary"
            >`;
if (drawer.includes("'cart-upsell-bisht', context: 'drawer'")) {
  console.log("⚠️  cart-drawer already has cart-upsell-bisht render — skipping");
} else if (!drawer.includes(drawerMarker)) {
  console.error("❌ Drawer insertion marker not found — schema may have changed");
  console.log("    Looking for:");
  console.log(drawerMarker);
  process.exit(1);
} else {
  const drawerInjection = `            </scroll-hint>

            <div class="cart-drawer__upsell">
              {%- render 'cart-upsell-bisht', context: 'drawer' -%}
            </div>

            <div
              class="cart-drawer__summary"
            >`;
  const drawerUpdated = drawer.replace(drawerMarker, drawerInjection);
  console.log("→ Pushing modified snippets/cart-drawer.liquid…");
  await putAsset("snippets/cart-drawer.liquid", drawerUpdated);
  console.log("  ✅ drawer injection deployed");
}

// 4) Touch theme.liquid to bust page_cache
console.log("\n→ Touching layout/theme.liquid to invalidate page cache…");
const themeLayout = await getAsset("layout/theme.liquid");
if (themeLayout) {
  await putAsset("layout/theme.liquid", themeLayout);
  console.log("  ✅ cache busted");
}

console.log("\n══════════════════════════════════════════");
console.log("  ✅ Cart upsell deployed to LIVE theme");
console.log("══════════════════════════════════════════");
console.log("\nTest it now:");
console.log("  1. Open https://bluemarineatelier.com/collections/all");
console.log("  2. Add any daraa to cart");
console.log("  3. Open the cart page (top-right cart icon → View cart)");
console.log("  4. Verify upsell card appears between items and summary");
console.log("  5. Add a Bisht Set → upsell card should disappear");
console.log("\nRollback if needed:");
console.log(`  Restore ${backupPath} via Shopify Admin → Online Store → Themes → Code editor`);
