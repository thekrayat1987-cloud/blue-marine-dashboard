#!/usr/bin/env node
/**
 * Investigate why x-default + hreflang="ar" still point to
 * atelier-blue-marine.myshopify.com after webPresence fix.
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

async function gql(query) {
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (j.errors) console.error("ERR:", JSON.stringify(j.errors, null, 2));
  return j.data;
}

console.log("--- All markets (paged through 100) ---");
const m = await gql(`{
  markets(first: 100) {
    edges { node {
      id name handle enabled primary
      webPresence { id rootUrls { url locale } }
    } }
  }
}`);
console.log(JSON.stringify(m, null, 2));

console.log("\n--- Shop domains ---");
const d = await gql(`{ shop { myshopifyDomain primaryDomain { url } domains { id host url sslEnabled } } }`);
console.log(JSON.stringify(d, null, 2));

console.log("\n--- Try fetching the .myshopify domain to see what it serves ---");
for (const host of ["atelier-blue-marine.myshopify.com", "c7z8qr-7w.myshopify.com"]) {
  try {
    const r = await fetch(`https://${host}/`, {
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 BlueMarineDiag" },
    });
    console.log(`  ${host} → status ${r.status}, location: ${r.headers.get("location") || "(no redirect)"}`);
  } catch (e) {
    console.log(`  ${host} → fetch error: ${e.message}`);
  }
}

console.log("\n--- Check theme.liquid for hreflang custom code ---");
const themesData = await gql(`{ themes(first: 20) { edges { node { id name role } } } }`);
const liveTheme = themesData.themes.edges.find((e) => e.node.role === "MAIN");
console.log(`Live theme: ${liveTheme.node.name} (${liveTheme.node.id})`);
const themeNumericId = liveTheme.node.id.replace("gid://shopify/OnlineStoreTheme/", "");
const restURL = `https://${STORE}/admin/api/${VERSION}/themes/${themeNumericId}/assets.json?asset[key]=layout/theme.liquid`;
const rr = await fetch(restURL, { headers: { "X-Shopify-Access-Token": TOKEN } });
const rj = await rr.json();
const themeLiquid = rj.asset?.value || "";
const hreflangLines = themeLiquid.split("\n").filter((l) => /hreflang|alternate/i.test(l));
console.log(`Lines mentioning hreflang/alternate in theme.liquid: ${hreflangLines.length}`);
for (const line of hreflangLines.slice(0, 10)) console.log("  >>", line.trim());
