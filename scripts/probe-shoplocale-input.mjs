import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const URL = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${process.env.SHOPIFY_API_VERSION || "2024-10"}/graphql.json`;
async function gql(q) {
  const r = await fetch(URL, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN }, body: JSON.stringify({ query: q }) });
  return r.json();
}
const r = await gql(`{ __type(name: "ShopLocaleInput") { inputFields { name type { name } description } } }`);
console.log("ShopLocaleInput:", JSON.stringify(r, null, 2));
const r2 = await gql(`{ __type(name: "ShopLocale") { fields { name type { name } description } } }`);
console.log("\nShopLocale:", JSON.stringify(r2, null, 2));
