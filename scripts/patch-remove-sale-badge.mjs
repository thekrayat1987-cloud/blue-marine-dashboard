// Blue Marine — remove the "sale" badge from product cards.
//
// Edits snippets/product-card-badges.liquid to drop the
// `product.compare_at_price > product.price` branch so the
// "تخفيضات" / "Sale" pill never renders. The sold-out badge stays.
//
// Usage from the dashboard/ folder:
//   Dry run:   node --env-file=.env.local scripts/patch-remove-sale-badge.mjs
//   Apply:     node --env-file=.env.local scripts/patch-remove-sale-badge.mjs --apply

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

const ASSET_KEY = "snippets/product-card-badges.liquid";
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

const FROM = `  {%- if product.available == false or product.compare_at_price > product.price -%}
    <div
      class="
        product-badges__badge product-badges__badge--rectangle
        {% if product.available == false %} color-{{ settings.badge_sold_out_color_scheme }}{% elsif product.compare_at_price > product.price %} color-{{ settings.badge_sale_color_scheme }}{% endif %}
      "
    >
      {%- if product.available == false -%}
        {{ 'content.product_badge_sold_out' | t }}
      {%- elsif product.compare_at_price > product.price -%}
        {{ 'content.product_badge_sale' | t }}
      {%- endif -%}
    </div>
  {%- endif -%}`;

const TO = `  {%- if product.available == false -%}
    <div
      class="
        product-badges__badge product-badges__badge--rectangle
         color-{{ settings.badge_sold_out_color_scheme }}
      "
    >
      {{ 'content.product_badge_sold_out' | t }}
    </div>
  {%- endif -%}`;

(async () => {
  console.log(`Fetching ${ASSET_KEY} from theme ${THEME_ID}...`);
  const original = await getAsset();

  if (!original.includes(FROM)) {
    if (!original.includes("product_badge_sale")) {
      console.log("Sale badge already removed. Nothing to do.");
      return;
    }
    console.error("Could not locate the expected badge block — aborting.");
    process.exit(1);
  }

  const patched = original.replace(FROM, TO);

  mkdirSync(BACKUP_DIR, { recursive: true });
  const backupPath = join(BACKUP_DIR, `product-card-badges.liquid.presaleremove_${timestamp()}.liquid`);
  writeFileSync(backupPath, original, "utf8");
  console.log(`Backup saved: ${backupPath}`);

  if (!apply) {
    console.log("\nDry run — pass --apply to push the change.");
    console.log("Sale-badge branch will be removed; sold-out badge kept.");
    return;
  }

  console.log("Pushing patched snippet...");
  await putAsset(patched);
  console.log("Done. Sale badge is no longer rendered on product cards.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
