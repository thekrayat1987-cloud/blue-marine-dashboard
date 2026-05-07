// Blue Marine — patch theme.liquid to keep model heads visible on product cards.
//
// Replaces `object-position: center center` with `object-position: center top`
// inside layout/theme.liquid. Saves a timestamped backup of the live file
// under shopify-snippets/backups/ before pushing the change.
//
// Usage from the dashboard/ folder:
//   Dry run (download + show diff, no write):
//     node --env-file=.env.local scripts/patch-card-image-position.mjs
//
//   Apply:
//     node --env-file=.env.local scripts/patch-card-image-position.mjs --apply

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

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

const FROM = "object-position: center center !important;";
const TO = "object-position: center top !important;";

(async () => {
  console.log(`Fetching ${ASSET_KEY} from theme ${THEME_ID}...`);
  const original = await getAsset();
  const matches = original.split(FROM).length - 1;
  console.log(`Found ${matches} occurrence(s) of "${FROM}"`);

  if (matches === 0) {
    console.log("Nothing to patch. Exiting.");
    return;
  }

  const patched = original.split(FROM).join(TO);

  mkdirSync(BACKUP_DIR, { recursive: true });
  const backupPath = join(BACKUP_DIR, `theme.liquid.preheadcrop_${timestamp()}.liquid`);
  writeFileSync(backupPath, original, "utf8");
  console.log(`Backup saved: ${backupPath}`);

  if (!apply) {
    console.log("\nDry run — pass --apply to push the change.");
    console.log(`Will replace ${matches} occurrence(s).`);
    return;
  }

  console.log("Pushing patched theme.liquid...");
  await putAsset(patched);
  console.log(`Done. ${matches} occurrence(s) replaced.`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
