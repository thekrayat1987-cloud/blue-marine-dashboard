#!/usr/bin/env node
/**
 * Audit Arabic translation coverage for the theme's checkout/system strings.
 * Reports: total keys, AR-registered keys, AR-missing keys, and lists the
 * specific labels visible on the checkout page (Contact, Delivery, etc.).
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
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const RID = "gid://shopify/OnlineStoreThemeLocaleContent/182480240940";

const data = await gql(
  `query($id: ID!) {
    translatableResource(resourceId: $id) {
      translatableContent { key value digest type }
      translations(locale: "ar") { key value outdated }
    }
  }`,
  { id: RID },
);

const content = data.translatableResource.translatableContent;
const ar = data.translatableResource.translations;
const arByKey = new Map(ar.map((t) => [t.key, t]));

const checkout = content.filter((c) => c.key.startsWith("shopify.checkout."));
console.log(`Total locale keys: ${content.length}`);
console.log(`Checkout keys: ${checkout.length}`);
console.log(`AR translations registered (any key): ${ar.length}`);

const checkoutWithAr = checkout.filter((c) => arByKey.has(c.key));
const checkoutMissing = checkout.filter((c) => !arByKey.has(c.key));
const checkoutOutdated = checkout.filter((c) => arByKey.get(c.key)?.outdated);

console.log(`Checkout WITH AR: ${checkoutWithAr.length}`);
console.log(`Checkout MISSING AR: ${checkoutMissing.length}`);
console.log(`Checkout OUTDATED AR: ${checkoutOutdated.length}`);

// Look up the specific labels the user sees on the checkout page.
const probes = [
  "Contact",
  "Email or mobile phone number",
  "Delivery",
  "First name",
  "Last name",
  "Address",
  "Apartment, suite, etc.",
  "City",
  "Postal code",
  "Country/Region",
  "Subtotal",
  "Shipping",
  "Total",
  "TOTAL SAVINGS",
  "items",
  "Free",
];

console.log("\n--- Visible labels lookup ---");
for (const p of probes) {
  const matches = checkout.filter((c) => String(c.value).toLowerCase() === p.toLowerCase());
  if (!matches.length) {
    console.log(`[${p}] no exact match in EN values`);
    continue;
  }
  for (const m of matches.slice(0, 3)) {
    const arT = arByKey.get(m.key);
    console.log(
      `[${p}] key=${m.key}\n   EN="${m.value}"\n   AR=${arT ? `"${arT.value}"${arT.outdated ? " (OUTDATED)" : ""}` : "MISSING"}`,
    );
  }
}

// Sample missing keys to understand pattern.
console.log("\n--- First 20 MISSING checkout keys ---");
for (const c of checkoutMissing.slice(0, 20)) {
  console.log(`  ${c.key}\n     EN: ${JSON.stringify(c.value).slice(0, 100)}`);
}
