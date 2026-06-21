// Blue Marine — fix Arabic collection description alignment.
//
// Adds an RTL/right-align rule for rte-formatter paragraphs to the AR-only
// <style> block in layout/theme.liquid, so collection descriptions align
// with their titles instead of inheriting the theme's default LTR behavior.
//
// Usage from the dashboard/ folder:
//   Dry run:   node --env-file=.env.local scripts/patch-collection-description-align.mjs
//   Apply:     node --env-file=.env.local scripts/patch-collection-description-align.mjs --apply

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
const HEADERS = {
  "X-Shopify-Access-Token": TOKEN,
  "Content-Type": "application/json",
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(__dirname, "..", "..", "shopify-snippets", "backups");

const MARKER = "</style>\n\n{% endif %}";
const SENTINEL = "/* === Collection description — match title alignment";
const CSS_BLOCK = `
  /* === Collection description — match title alignment + balance lines === */
  rte-formatter.text-block.rte,
  rte-formatter.text-block.rte p {
    text-align: right !important;
    direction: rtl !important;
  }
  rte-formatter.text-block.rte p {
    text-wrap: balance;
  }
`;

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function isoBust() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function getAsset() {
  const url = `${BASE}?asset[key]=${encodeURIComponent(ASSET_KEY)}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`GET ${ASSET_KEY} failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.asset.value;
}

async function putAsset(value) {
  const res = await fetch(BASE, {
    method: "PUT",
    headers: HEADERS,
    body: JSON.stringify({ asset: { key: ASSET_KEY, value } }),
  });
  if (!res.ok) throw new Error(`PUT ${ASSET_KEY} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

(async () => {
  console.log(`Fetching ${ASSET_KEY} from theme ${THEME_ID}...`);
  const original = await getAsset();

  if (original.includes(SENTINEL)) {
    console.log("Rule already present — nothing to inject. Will only refresh cache-bust.");
  }

  if (!original.includes(MARKER)) {
    console.error(`Could not find AR-block marker '${MARKER}' — aborting.`);
    process.exit(1);
  }

  let patched = original;
  if (!original.includes(SENTINEL)) {
    patched = patched.replace(MARKER, `${CSS_BLOCK}\n${MARKER}`);
  }

  // Refresh the cache-bust comment so HTML re-renders
  patched = patched.replace(
    /<!-- bm-cache-bust:[^>]*-->/,
    `<!-- bm-cache-bust:${isoBust()} -->`,
  );

  if (patched === original) {
    console.log("No changes computed. Nothing to push.");
    return;
  }

  mkdirSync(BACKUP_DIR, { recursive: true });
  const backupPath = join(BACKUP_DIR, `theme.liquid.colalign_${timestamp()}.liquid`);
  writeFileSync(backupPath, original, "utf8");
  console.log(`Backup saved: ${backupPath}`);

  if (!apply) {
    console.log("\nDry run — pass --apply to push.");
    console.log("Will inject RTL alignment rule for rte-formatter (collection descriptions) and refresh cache-bust.");
    return;
  }

  console.log("Pushing patched theme.liquid...");
  await putAsset(patched);
  console.log("Done.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
