#!/usr/bin/env node
/**
 * Finish the Bisht Set collection setup: AR translation + publishing.
 * Run after create-bisht-set-smart-collection.mjs.
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
  if (j.errors) {
    console.error("GraphQL errors:", JSON.stringify(j.errors, null, 2));
  }
  return j;
}

const collectionId = "gid://shopify/Collection/505012060460";

// 1) Get translatable content (need digests)
const transRes = await gql(
  `query($id: ID!) {
    translatableResource(resourceId: $id) {
      resourceId
      translatableContent { key value digest locale type }
    }
  }`,
  { id: collectionId }
);
console.log("Translatable content found:");
const content = transRes.data?.translatableResource?.translatableContent || [];
for (const c of content) {
  console.log(`  ${c.key.padEnd(20)} digest=${c.digest?.slice(0, 8) || "(none)"} locale=${c.locale}`);
}

const titleC = content.find((c) => c.key === "title");
const descC = content.find((c) => c.key === "body_html");

if (!titleC?.digest) {
  console.error("❌ No digest for title — cannot translate");
  process.exit(1);
}

// 2) Register AR translations (resourceId must be a String, per Shopify schema)
const translations = [
  {
    key: "title",
    value: "طقم بشت",
    locale: "ar",
    translatableContentDigest: titleC.digest,
  },
];
if (descC?.digest) {
  translations.push({
    key: "body_html",
    value:
      "<p>أكملي اللوك. ثلاث قطع — درّاعة، بشت، وحزام مطابق — مصممة لتُلبس معاً للأعراس والسهرات والمناسبات الخاصة.</p>",
    locale: "ar",
    translatableContentDigest: descC.digest,
  });
}

const regRes = await gql(
  `mutation($id: ID!, $tr: [TranslationInput!]!) {
    translationsRegister(resourceId: $id, translations: $tr) {
      translations { key value locale }
      userErrors { field message }
    }
  }`,
  { id: collectionId, tr: translations }
);
console.log("\nAR translation result:");
console.log(JSON.stringify(regRes.data?.translationsRegister || regRes, null, 2));

// 3) Publish to online store + USA market
const pubRes = await gql(
  `query { publications(first: 20) { edges { node { id name } } } }`
);
const pubs = pubRes.data.publications.edges;
console.log("\nAll publications:");
for (const e of pubs) console.log(`  ${e.node.name.padEnd(30)} ${e.node.id}`);

const targetPubs = pubs
  .filter((e) =>
    /online store|us$|usa|en-us|point of sale/i.test(e.node.name)
  )
  .map((e) => ({ publicationId: e.node.id }));

const pubInputs = targetPubs;
if (pubInputs.length) {
  const pubResult = await gql(
    `mutation($id: ID!, $pubs: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $pubs) {
        publishable { ... on Collection { id title } }
        userErrors { field message }
      }
    }`,
    { id: collectionId, pubs: pubInputs }
  );
  console.log("\nPublish result:");
  console.log(JSON.stringify(pubResult.data?.publishablePublish || pubResult, null, 2));
}

console.log("\nLive URLs:");
console.log(`  AR default: https://bluemarineatelier.com/collections/bisht-set`);
console.log(`  EN (USA):   https://bluemarineatelier.com/en-us/collections/bisht-set`);
console.log(`  Auto-discount: https://bluemarineatelier.com/discount/MATCHINGBISHT15?redirect=/collections/bisht-set`);
