#!/usr/bin/env node
/**
 * Probe whether the Shopify Admin API exposes a way to remove a
 * *.myshopify.com domain via mutation. Read-only introspection — no
 * actual mutations executed.
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
      fields {
        name
      }
    }
  }
}`;

const { data } = await gql(introspect);
const allMutations = data.__schema.mutationType.fields.map((f) => f.name).sort();
const domainMutations = allMutations.filter((n) => /domain/i.test(n));
console.log("Mutations matching /domain/i:");
for (const n of domainMutations) console.log("  -", n);

console.log("\nMutations matching /shop|primary/i:");
const shopMutations = allMutations.filter((n) => /^shop|primary/i.test(n));
for (const n of shopMutations) console.log("  -", n);
