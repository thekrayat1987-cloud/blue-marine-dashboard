#!/usr/bin/env node
/**
 * Remove `en` from the market webPresence's alternateLocales so Shopify
 * cannot auto-redirect English-language browsers to /en. Default locale
 * stays `ar`, domain stays bluemarineatelier.com.
 *
 * Approved by Khadija on 2026-05-09 after both geolocation apps
 * (Shopify Geolocation, Orbe) were confirmed unavailable.
 *
 * Trade-off accepted: loss of en-XX hreflang for the 6 GCC countries.
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
const PRIMARY_DOMAIN_ID = "gid://shopify/Domain/163770302764";

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
  mutation RemoveEn($webPresenceId: ID!, $webPresence: MarketWebPresenceUpdateInput!) {
    marketWebPresenceUpdate(webPresenceId: $webPresenceId, webPresence: $webPresence) {
      market {
        webPresence {
          id
          rootUrls { url locale }
          defaultLocale { locale }
          alternateLocales { locale }
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
    alternateLocales: [],
  },
};

console.log("Removing 'en' from webPresence alternateLocales...");
const result = await gql(mutation, variables);
const payload = result.marketWebPresenceUpdate;
if (payload.userErrors?.length) {
  console.error("❌ userErrors:", JSON.stringify(payload.userErrors, null, 2));
  process.exit(1);
}
console.log("✅ Done. New webPresence config:");
console.log(JSON.stringify(payload.market.webPresence, null, 2));
