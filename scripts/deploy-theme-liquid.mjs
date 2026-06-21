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
const THEME_ID = "182480240940";
const content = readFileSync("/tmp/theme.liquid", "utf8");
const r = await fetch(`https://${STORE}/admin/api/${VERSION}/themes/${THEME_ID}/assets.json`, {
  method: "PUT",
  headers: { "X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json" },
  body: JSON.stringify({ asset: { key: "layout/theme.liquid", value: content } }),
});
const data = await r.json();
console.log(r.status, JSON.stringify(data).slice(0, 300));
