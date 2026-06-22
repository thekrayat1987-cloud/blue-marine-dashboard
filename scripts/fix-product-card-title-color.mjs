// Blue Marine — make product-card titles visible on every color scheme.
//
// Product-card titles render inside <a ref="productTitleLink"> using the 'rte'
// preset, so they inherit the color scheme's LINK/primary color (not the
// foreground). On scheme-2 (navy) primary == background (#173057), so titles
// render navy-on-navy and vanish — the price survives only because it uses the
// 'h6' preset which applies color:foreground (white). This injects a CSS block
// into layout/theme.liquid forcing card titles to the scheme FOREGROUND color,
// which is correct on every scheme (white on navy, dark on beige).
//
// Usage from the dashboard/ folder:
//   Dry run:  node --env-file=.env.local scripts/fix-product-card-title-color.mjs
//   Apply:    node --env-file=.env.local scripts/fix-product-card-title-color.mjs --apply

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const THEME_ID = process.env.SHOPIFY_THEME_ID || "182480240940";

if (!STORE || !TOKEN) {
  console.error("Missing SHOPIFY_STORE_URL or SHOPIFY_ACCESS_TOKEN.");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const ASSET_KEY = "layout/theme.liquid";
const BASE = `https://${STORE}/admin/api/${VERSION}/themes/${THEME_ID}/assets.json`;
const HEADERS = { "X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json" };

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(__dirname, "..", "..", "shopify-snippets", "backups");

const MARKER_START = "/* BM_PRODUCT_CARD_TITLE_FIX */";
const MARKER_END = "/* END_BM_PRODUCT_CARD_TITLE_FIX */";
const BLOCK = `<style>${MARKER_START}
/* Card titles sit in <a ref="productTitleLink"> with the 'rte' preset, so they
   inherit the scheme link color. On scheme-2 link==background (#173057) =>
   navy-on-navy => invisible. Force the scheme foreground instead. */
a[ref="productTitleLink"],
a[ref="productTitleLink"] .text-block,
a[ref="productTitleLink"] .text-block p,
a[ref="productTitleLink"] p,
[class*="product_title"],
[class*="product_title"] p {
  color: var(--color-foreground) !important;
}
${MARKER_END}</style>`;

async function getAsset() {
  const res = await fetch(`${BASE}?asset[key]=${encodeURIComponent(ASSET_KEY)}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`GET failed: ${res.status} ${await res.text()}`);
  return (await res.json()).asset.value;
}
async function putAsset(value) {
  const res = await fetch(BASE, { method: "PUT", headers: HEADERS, body: JSON.stringify({ asset: { key: ASSET_KEY, value } }) });
  if (!res.ok) throw new Error(`PUT failed: ${res.status} ${await res.text()}`);
  return res.json();
}
function timestamp() {
  const d = new Date(), pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

(async () => {
  console.log(`Fetching ${ASSET_KEY} from theme ${THEME_ID}...`);
  const original = await getAsset();

  if (original.includes(MARKER_START)) {
    console.log("Fix already present (BM_PRODUCT_CARD_TITLE_FIX). Nothing to do.");
    return;
  }
  // Inject just before </head> so it overrides theme + section CSS.
  const idx = original.lastIndexOf("</head>");
  if (idx === -1) throw new Error("Could not find </head> in theme.liquid");
  const patched = original.slice(0, idx) + BLOCK + "\n" + original.slice(idx);

  mkdirSync(BACKUP_DIR, { recursive: true });
  const backupPath = join(BACKUP_DIR, `theme.liquid.precardtitle_${timestamp()}.liquid`);
  writeFileSync(backupPath, original, "utf8");
  console.log(`Backup saved: ${backupPath}`);

  if (!apply) {
    console.log("\n--- CSS block to inject before </head> ---\n" + BLOCK);
    console.log("\nDry run — pass --apply to push.");
    return;
  }
  console.log("Pushing patched theme.liquid...");
  await putAsset(patched);
  console.log("Done. Card titles now use the scheme foreground color.");
})().catch((e) => { console.error(e); process.exit(1); });
