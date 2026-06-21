#!/usr/bin/env node
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
async function gql(q, v) {
  const r = await fetch(URL, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN }, body: JSON.stringify({ query: q, variables: v }) });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors, null, 2));
  return j.data;
}
const result = await gql(`
  mutation($id: ID!, $wp: MarketWebPresenceUpdateInput!) {
    marketWebPresenceUpdate(webPresenceId: $id, webPresence: $wp) {
      market { webPresence { rootUrls { url locale } defaultLocale { locale } alternateLocales { locale } } }
      userErrors { field message }
    }
  }
`, {
  id: "gid://shopify/MarketWebPresence/66137063724",
  wp: { domainId: "gid://shopify/Domain/163770302764", defaultLocale: "ar", alternateLocales: ["en"] }
});
if (result.marketWebPresenceUpdate.userErrors?.length) { console.error("ERR", result.marketWebPresenceUpdate.userErrors); process.exit(1); }
console.log("✅ en re-added. Config:");
console.log(JSON.stringify(result.marketWebPresenceUpdate.market.webPresence, null, 2));
