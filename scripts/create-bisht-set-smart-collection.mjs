#!/usr/bin/env node
/**
 * Create a smart auto-updating "Bisht Set" collection — destination
 * for the post-purchase upsell email + WhatsApp.
 *
 * Rule: products where product_type == "Bisht Set".
 * Includes AR translation (per project_collection_naming.md).
 *
 * Does NOT add to homepage or nav — that's Khadija's editorial call.
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
  return r.json();
}

const HANDLE = "bisht-set";
const TITLE_EN = "Bisht Set";
const TITLE_AR = "طقم بشت";

// 1) Does it already exist?
const existing = await gql(
  `query($h: String!) { collectionByHandle(handle: $h) { id title } }`,
  { h: HANDLE }
);
let collectionId = existing.data?.collectionByHandle?.id;

if (collectionId) {
  console.log(`Collection already exists: ${collectionId}`);
} else {
  const createRes = await gql(
    `mutation($input: CollectionInput!) {
      collectionCreate(input: $input) {
        collection { id handle title }
        userErrors { field message }
      }
    }`,
    {
      input: {
        title: TITLE_EN,
        handle: HANDLE,
        descriptionHtml:
          "<p>Complete the look. Three pieces — daraa, bisht, and matching belt — designed to be worn together for weddings, evenings, and special gatherings.</p>",
        ruleSet: {
          appliedDisjunctively: false,
          rules: [{ column: "TYPE", relation: "EQUALS", condition: "Bisht Set" }],
        },
        sortOrder: "BEST_SELLING",
      },
    }
  );
  const errs = createRes.data?.collectionCreate?.userErrors || [];
  if (errs.length) {
    console.error("❌ collectionCreate errors:");
    for (const e of errs) console.error(`   - ${e.field?.join(".")}: ${e.message}`);
    process.exit(1);
  }
  collectionId = createRes.data.collectionCreate.collection.id;
  console.log(`✅ Created collection ${collectionId}`);
}

// 2) Register AR translation (per project_collection_naming.md)
const translatableRes = await gql(
  `query($id: ID!) { translatableResource(resourceId: $id) { translatableContent { key value digest locale } } }`,
  { id: collectionId }
);
const titleField = translatableRes.data?.translatableResource?.translatableContent?.find(
  (c) => c.key === "title"
);
const descField = translatableRes.data?.translatableResource?.translatableContent?.find(
  (c) => c.key === "body_html"
);
const translations = [];
if (titleField) {
  translations.push({
    key: "title",
    value: TITLE_AR,
    locale: "ar",
    translatableContentDigest: titleField.digest,
  });
}
if (descField) {
  translations.push({
    key: "body_html",
    value: "<p>أكملي اللوك. ثلاث قطع — درّاعة، بشت، وحزام مطابق — مصممة لتُلبس معاً للأعراس والسهرات والمناسبات الخاصة.</p>",
    locale: "ar",
    translatableContentDigest: descField.digest,
  });
}
if (translations.length) {
  const trRes = await gql(
    `mutation($id: String!, $tr: [TranslationInput!]!) {
      translationsRegister(resourceId: $id, translations: $tr) {
        translations { key value locale }
        userErrors { field message }
      }
    }`,
    { id: collectionId, tr: translations }
  );
  const errs = trRes.data?.translationsRegister?.userErrors || [];
  if (errs.length) {
    console.error("⚠️  translationsRegister warnings:");
    for (const e of errs) console.error(`   - ${e.field?.join(".")}: ${e.message}`);
  } else {
    console.log(`✅ AR translations registered (${trRes.data.translationsRegister.translations.length})`);
  }
}

// 3) Publish to online store + USA market
const pubRes = await gql(
  `query { publications(first: 20) { edges { node { id name } } } }`
);
const pubs = pubRes.data.publications.edges
  .filter((e) => /online store|us|usa|en-us/i.test(e.node.name))
  .map((e) => ({ publicationId: e.node.id }));
if (pubs.length) {
  await gql(
    `mutation($id: ID!, $pubs: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $pubs) {
        publishable { ... on Collection { id } }
        userErrors { field message }
      }
    }`,
    { id: collectionId, pubs }
  );
  console.log(`✅ Published to ${pubs.length} channels: ${pubRes.data.publications.edges.filter((e)=>/online store|us|usa|en-us/i.test(e.node.name)).map(e=>e.node.name).join(", ")}`);
}

console.log(`\nCollection URL (AR default): https://bluemarineatelier.com/collections/${HANDLE}`);
console.log(`Collection URL (USA EN):     https://bluemarineatelier.com/en-us/collections/${HANDLE}`);
console.log(`Discount auto-apply URL:     https://bluemarineatelier.com/discount/MATCHINGBISHT15?redirect=/collections/${HANDLE}`);
