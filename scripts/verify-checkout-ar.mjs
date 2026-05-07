#!/usr/bin/env node
/**
 * Verify that the Arabic checkout translations were registered.
 * Probes the user-visible labels from the screenshot and reports
 * EN source + AR translation for each.
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
const RID = "gid://shopify/OnlineStoreThemeLocaleContent/182480240940";

async function gql(q, v) {
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query: q, variables: v }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const KEYS_TO_CHECK = [
  "shopify.checkout.contact.contact_method_title", // Contact
  "shopify.checkout.contact.email_or_phone_label", // Email or mobile phone number
  "shopify.checkout.shipping.delivery_title", // Delivery
  "shopify.checkout.contact.first_name_label",
  "shopify.checkout.contact.last_name_label",
  "shopify.checkout.contact.address1_label",
  "shopify.checkout.contact.address2_label",
  "shopify.checkout.contact.city_label",
  "shopify.checkout.contact.postal_code_label",
  "shopify.checkout.contact.country_label",
  "shopify.checkout.order_summary.subtotal_label",
  "shopify.checkout.order_summary.shipping_label",
  "shopify.checkout.order_summary.total_label",
  "shopify.checkout.order_summary.total_savings",
  "shopify.checkout.order_summary.free_total_label",
  "shopify.checkout.general.continue_button_label",
  "shopify.checkout.general.complete_purchase_button_label",
  "shopify.checkout.general.pay_now_button_label",
];

const data = await gql(
  `query($id: ID!) {
    translatableResource(resourceId: $id) {
      translatableContent { key value }
      translations(locale: "ar") { key value outdated }
    }
  }`,
  { id: RID },
);

const enByKey = new Map(data.translatableResource.translatableContent.map((c) => [c.key, c.value]));
const arByKey = new Map(data.translatableResource.translations.map((t) => [t.key, t]));

console.log(`Total AR translations registered: ${data.translatableResource.translations.length}`);
console.log("\n--- Sample of visible checkout labels ---");
let ok = 0;
let missing = 0;
for (const k of KEYS_TO_CHECK) {
  const en = enByKey.get(k);
  const ar = arByKey.get(k);
  if (!en) {
    console.log(`  ${k} :: KEY NOT FOUND`);
    continue;
  }
  if (!ar) {
    console.log(`  ${k}\n    EN: ${JSON.stringify(en)}\n    AR: MISSING`);
    missing++;
    continue;
  }
  console.log(`  ${k}\n    EN: ${JSON.stringify(en)}\n    AR: ${JSON.stringify(ar.value)}${ar.outdated ? " (OUTDATED)" : ""}`);
  ok++;
}
console.log(`\nResult: ${ok} translated, ${missing} missing (out of ${KEYS_TO_CHECK.length} probed).`);
