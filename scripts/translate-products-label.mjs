#!/usr/bin/env node
/**
 * Register the Arabic translation for the storefront "Products" page heading.
 * Target key: shopify.page_titles.products on ONLINE_STORE_THEME_LOCALE_CONTENT.
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

const RESOURCE_ID = "gid://shopify/OnlineStoreThemeLocaleContent/182480240940";
const KEY = "shopify.page_titles.products";
const DIGEST = "4edc8bfafc6bd936b849f38c009454eac0febc8982f990e734724156584d56f9";
const AR_VALUE = "المنتجات";

async function gql(query, variables = {}) {
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  return r.json();
}

const mutation = `
  mutation translationsRegister($resourceId: ID!, $translations: [TranslationInput!]!) {
    translationsRegister(resourceId: $resourceId, translations: $translations) {
      userErrors { message field }
      translations { key value locale }
    }
  }
`;

const j = await gql(mutation, {
  resourceId: RESOURCE_ID,
  translations: [
    {
      key: KEY,
      value: AR_VALUE,
      locale: "ar",
      translatableContentDigest: DIGEST,
    },
  ],
});

console.log(JSON.stringify(j, null, 2));
