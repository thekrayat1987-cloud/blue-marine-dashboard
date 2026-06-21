// Blue Marine — keep the model's face visible in the sticky add-to-cart thumbnail.
//
// The theme renders the sticky bar product image as a square crop with the
// browser default object-position (center center). With our 9:16 catalog
// photos that crops the model's torso instead of their face. We override it
// to "center top" so the head is visible, matching the product card behaviour.
//
// Usage from dashboard/:
//   Dry run: node --env-file=.env.local scripts/patch-sticky-atc-thumb.mjs
//   Apply:   node --env-file=.env.local scripts/patch-sticky-atc-thumb.mjs --apply

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

const MARKER = "/* === Sticky add-to-cart : pastille produit recadrée sur la tête === */";
const PATCH = `${MARKER}
  .sticky-add-to-cart__image-img {
    object-fit: cover !important;
    object-position: center top !important;
  }
`;

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function getAsset() {
  const url = `${BASE}?asset[key]=${encodeURIComponent(ASSET_KEY)}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`GET failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.asset.value;
}

async function putAsset(value) {
  const res = await fetch(BASE, {
    method: "PUT",
    headers: HEADERS,
    body: JSON.stringify({ asset: { key: ASSET_KEY, value } }),
  });
  if (!res.ok) throw new Error(`PUT failed: ${res.status} ${await res.text()}`);
  return res.json();
}

(async () => {
  console.log(`Fetching ${ASSET_KEY}...`);
  const original = await getAsset();

  if (original.includes(MARKER)) {
    console.log("Marker already present — patch is idempotent, exiting.");
    return;
  }

  const closingTag = "</style>\n</head>";
  const idx = original.lastIndexOf(closingTag);
  if (idx === -1) throw new Error("Could not find </style>\\n</head> insertion point");

  const patched = original.slice(0, idx) + PATCH + original.slice(idx);

  mkdirSync(BACKUP_DIR, { recursive: true });
  const backupPath = join(BACKUP_DIR, `theme.liquid.prestickythumb_${timestamp()}.liquid`);
  writeFileSync(backupPath, original, "utf8");
  console.log(`Backup saved: ${backupPath}`);

  if (!apply) {
    console.log("\nDry run — pass --apply to push.");
    console.log(`Will insert ${PATCH.length} bytes before </style></head>.`);
    return;
  }

  console.log("Pushing patched theme.liquid...");
  await putAsset(patched);
  console.log("Done.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
