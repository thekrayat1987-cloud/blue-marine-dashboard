#!/usr/bin/env node
/**
 * Investigate where the auto-locale redirect comes from and whether
 * any API mutation can disable it.
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
  return r.json();
}

const introspect = `{
  __schema {
    mutationType {
      fields { name args { name type { name kind ofType { name kind } } } }
    }
  }
}`;

const { data } = await gql(introspect);
const fields = data.__schema.mutationType.fields;

const patterns = [/redirect/i, /locale/i, /language/i, /geo/i, /detect/i];
console.log("Mutations matching locale/redirect/geo patterns:");
const seen = new Set();
for (const f of fields) {
  if (patterns.some((p) => p.test(f.name)) && !seen.has(f.name)) {
    seen.add(f.name);
    console.log(`  - ${f.name}(${f.args.map((a) => `${a.name}: ${a.type.name || a.type.ofType?.name || "?"}`).join(", ")})`);
  }
}

console.log("\n--- MarketWebPresenceUpdateInput schema ---");
const inputType = await gql(`{
  __type(name: "MarketWebPresenceUpdateInput") {
    inputFields { name type { name kind ofType { name kind } } description }
  }
}`);
console.log(JSON.stringify(inputType.data, null, 2));

console.log("\n--- Market schema (look for redirect/auto) ---");
const marketType = await gql(`{
  __type(name: "Market") {
    fields { name description }
  }
}`);
const marketFields = marketType.data?.__type?.fields || [];
for (const f of marketFields) {
  if (/redirect|auto|geo|detect/i.test(f.name + " " + (f.description || ""))) {
    console.log(`  - ${f.name}: ${f.description || "(no desc)"}`);
  }
}

console.log("\n--- Available installed apps (look for Geolocation) ---");
const apps = await gql(`{
  appInstallations(first: 50) {
    edges { node { app { handle title } } }
  }
}`);
const appList = apps.data?.appInstallations?.edges?.map((e) => `${e.node.app.handle} (${e.node.app.title})`) || [];
console.log(appList.join("\n  ") || "(none or no permission)");
