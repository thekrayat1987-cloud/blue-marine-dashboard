#!/usr/bin/env node
// Blue Marine — make product-card images on the collection page a uniform ratio.
//
// The collection grid had product-card > card-gallery > image_ratio = "adapt",
// so every card matched its photo's native aspect ratio and the grid looked
// uneven (tall cards next to short cards). This sets a fixed ratio so all cards
// align. Valid values: adapt | portrait (4:5) | square (1:1) | landscape (16:9).
//
// Saves a timestamped backup of the live template before pushing.
//
// Usage (from dashboard/):
//   node scripts/fix-collection-card-ratio.mjs            # dry run, default portrait
//   node scripts/fix-collection-card-ratio.mjs --apply    # apply portrait
//   node scripts/fix-collection-card-ratio.mjs square --apply

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envText = fs.readFileSync(path.resolve(__dirname, "..", ".env.local"), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const THEME_ID = process.env.SHOPIFY_THEME_ID || "182480240940";
const BASE = `https://${STORE}/admin/api/${VERSION}/themes/${THEME_ID}/assets.json`;
const HEADERS = { "X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json" };

const VALID = ["adapt", "portrait", "square", "landscape"];
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const ratioArg = args.find((a) => VALID.includes(a)) || "portrait";

// Default target is just the collection page. Pass --all to apply the same
// fixed ratio to every template that renders a product-card grid (search,
// homepage product rows, product-page recommendations, cart, 404).
const ALL_TEMPLATES = [
  "templates/collection.json",
  "templates/search.json",
  "templates/index.json",
  "templates/product.json",
  "templates/product.custom.json",
  "templates/product.parfum.json",
  "templates/cart.json",
  "templates/404.json",
];
const TARGETS = args.includes("--all") ? ALL_TEMPLATES : ["templates/collection.json"];

async function getAsset(key) {
  const r = await fetch(`${BASE}?asset[key]=${encodeURIComponent(key)}`, { headers: HEADERS });
  if (!r.ok) throw new Error(`GET ${key}: ${r.status} ${await r.text()}`);
  return (await r.json()).asset.value;
}
async function putAsset(key, value) {
  const r = await fetch(BASE, {
    method: "PUT",
    headers: HEADERS,
    body: JSON.stringify({ asset: { key, value } }),
  });
  if (!r.ok) throw new Error(`PUT ${key}: ${r.status} ${await r.text()}`);
  return r.json();
}

// Recursively set every product-card card-gallery image_ratio we find.
let changed = 0;
function patch(node, hits) {
  if (!node || typeof node !== "object") return;
  if (
    typeof node.type === "string" &&
    /product-card-gallery$/.test(node.type) &&
    node.settings &&
    "image_ratio" in node.settings
  ) {
    const old = node.settings.image_ratio;
    if (old !== ratioArg) {
      console.log(`    image_ratio: "${old}" → "${ratioArg}"`);
      node.settings.image_ratio = ratioArg;
      hits.changed++;
      changed++;
    } else {
      console.log(`    image_ratio already "${ratioArg}" (skipped)`);
    }
  }
  for (const v of Object.values(node)) {
    if (v && typeof v === "object") patch(v, hits);
  }
}

const backupDir = path.resolve(__dirname, "..", "..", "shopify-snippets", "backups");
fs.mkdirSync(backupDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, "-");

for (const key of TARGETS) {
  console.log(`\n${key}`);
  const raw = await getAsset(key);
  const parsed = JSON.parse(raw);
  const hits = { changed: 0 };
  patch(parsed, hits);
  if (hits.changed === 0) {
    console.log("    nothing to change.");
    continue;
  }
  const backupPath = path.join(backupDir, `${path.basename(key)}.${ts}.json`);
  fs.writeFileSync(backupPath, raw);
  console.log(`    backup: ${backupPath}`);
  if (!apply) {
    console.log(`    dry run — ${hits.changed} block(s) would change.`);
    continue;
  }
  await putAsset(key, JSON.stringify(parsed, null, 2));
  console.log(`    ✅ deployed (${hits.changed} block(s))`);
}

console.log(
  `\n${apply ? "Applied" : "Dry run"}: ${changed} block(s) → image_ratio="${ratioArg}" on theme ${THEME_ID}`,
);
if (!apply && changed > 0) console.log("Pass --apply to push.");
