#!/usr/bin/env node
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

const SECTION_KEY = "collection_list_DQRtyh";
const NEW_RATIO = process.argv[2] || "adapt";

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

const raw = await getAsset("templates/index.json");

const backupDir = path.resolve(__dirname, "..", "..", "shopify-snippets", "backups");
fs.mkdirSync(backupDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(backupDir, `index.json.${ts}.json`);
fs.writeFileSync(backupPath, raw);
console.log(`Backup: ${backupPath}`);

const parsed = JSON.parse(raw);
const sec = parsed.sections?.[SECTION_KEY];
if (!sec) throw new Error(`Section ${SECTION_KEY} not found`);

const cardImg = sec.blocks?.["static-collection-card"]?.blocks?.["collection-card-image"];
if (!cardImg) throw new Error("collection-card-image block not found");

const oldRatio = cardImg.settings.image_ratio;
console.log(`image_ratio: "${oldRatio}" → "${NEW_RATIO}"`);
if (oldRatio === NEW_RATIO) {
  console.log("Already set; nothing to do.");
  process.exit(0);
}
cardImg.settings.image_ratio = NEW_RATIO;

const newValue = JSON.stringify(parsed, null, 2);
await putAsset("templates/index.json", newValue);
console.log(`✅ Deployed image_ratio="${NEW_RATIO}" to theme ${THEME_ID}`);
