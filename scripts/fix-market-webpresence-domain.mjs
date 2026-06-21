#!/usr/bin/env node
/**
 * Fix the Atelier Blue Marine market webPresence so that:
 *  - it is attached to bluemarineatelier.com (not c7z8qr-7w.myshopify.com)
 *  - defaultLocale stays "ar"
 *  - alternateLocales = ["en"] so Shopify emits en-XX hreflang for GCC
 *
 * Approved by Khadija on 2026-05-09 (option A — webPresence only, shop
 * primary locale untouched).
 */
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
const URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

const WEB_PRESENCE_ID = "gid://shopify/MarketWebPresence/66137063724";
const PRIMARY_DOMAIN_ID = "gid://shopify/Domain/163770302764"; // bluemarineatelier.com

async function gql(query, variables) {
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors, null, 2));
  return j.data;
}

const mutation = `
  mutation FixWebPresence($webPresenceId: ID!, $webPresence: MarketWebPresenceUpdateInput!) {
    marketWebPresenceUpdate(webPresenceId: $webPresenceId, webPresence: $webPresence) {
      market {
        id
        name
        webPresence {
          id
          rootUrls { url locale }
          defaultLocale { locale }
          alternateLocales { locale }
          domain { id host url }
        }
      }
      userErrors { field message code }
    }
  }
`;

const variables = {
  webPresenceId: WEB_PRESENCE_ID,
  webPresence: {
    domainId: PRIMARY_DOMAIN_ID,
    defaultLocale: "ar",
    alternateLocales: ["en"],
  },
};

console.log("Applying marketWebPresenceUpdate with:");
console.log(JSON.stringify(variables, null, 2));

const result = await gql(mutation, variables);
const payload = result.marketWebPresenceUpdate;

if (payload.userErrors && payload.userErrors.length > 0) {
  console.error("\n❌ userErrors:");
  console.error(JSON.stringify(payload.userErrors, null, 2));
  process.exit(1);
}

console.log("\n✅ Mutation succeeded.");
console.log("Market:", payload.market.name);
console.log("WebPresence after:");
console.log(JSON.stringify(payload.market.webPresence, null, 2));

console.log("\nNote: storefront hreflang HTML may take ~30s of cache TTL to update.");
