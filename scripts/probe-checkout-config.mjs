#!/usr/bin/env node
/**
 * Detect whether the store is on Checkout Extensibility (new) or
 * Legacy checkout.liquid + Additional Scripts (old).
 *
 * This decides how we build the post-purchase upsell:
 *  - Legacy → inject HTML/JS via Settings → Checkout → Additional Scripts
 *  - Extensibility → must build a Shopify Checkout UI Extension app
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

async function gql(query, variables = {}) {
  const r = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  return r.json();
}

console.log(`Store: ${STORE}`);
console.log(`API version: ${VERSION}\n`);

// 1) Shop-level info (paid plan, features)
const shopRes = await gql(`{
  shop {
    name
    plan { displayName partnerDevelopment shopifyPlus }
    features { branding storefront }
    primaryDomain { url }
  }
}`);
console.log("─── Shop ───");
console.log(JSON.stringify(shopRes.data?.shop || shopRes, null, 2));

// 2) Checkout profiles — presence here = Checkout Extensibility is active
const profilesRes = await gql(`{
  checkoutProfiles(first: 5) {
    edges {
      node {
        id
        name
        isPublished
        createdAt
        updatedAt
      }
    }
  }
}`);
console.log("\n─── checkoutProfiles (Extensibility indicator) ───");
console.log(JSON.stringify(profilesRes.data?.checkoutProfiles || profilesRes, null, 2));

// 3) Customer-facing thank-you experience — published profile
const publishedRes = await gql(`{
  checkoutProfiles(first: 5, query: "is_published:true") {
    edges { node { id name isPublished } }
  }
}`);
console.log("\n─── published checkout profile ───");
console.log(JSON.stringify(publishedRes.data?.checkoutProfiles || publishedRes, null, 2));

// 4) Installed apps that might already do post-purchase (avoid conflict)
const appsRes = await gql(`{
  appInstallations(first: 50) {
    edges {
      node {
        id
        app { title appStoreAppUrl }
      }
    }
  }
}`);
console.log("\n─── installed apps (look for ReConvert, AfterSell, Zipify, SuperLemon) ───");
const apps = appsRes.data?.appInstallations?.edges || [];
for (const e of apps) {
  console.log(`  - ${e.node.app.title}`);
}

// 5) Shopify Flow installed? (needed for Path C)
const flowInstalled = apps.find((e) => /flow/i.test(e.node.app.title));
console.log(
  `\nShopify Flow installed: ${flowInstalled ? "YES (Path C ready)" : "NO (must install free Shopify Flow app)"}`
);

// 6) SuperLemon installed?
const superLemon = apps.find((e) => /superlemon|super lemon/i.test(e.node.app.title));
console.log(
  `SuperLemon installed:   ${superLemon ? "YES" : "NO (verify in Shopify admin)"}`
);
