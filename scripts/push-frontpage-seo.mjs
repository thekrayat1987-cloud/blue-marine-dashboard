#!/usr/bin/env node
/**
 * Fill body + SEO on the frontpage (home) collection in EN + AR.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query, variables) {
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const HANDLE = "frontpage";

const BODY_EN = `<p>Discover Atelier Blue Marine — luxury Khaleeji daraas, bishts and evening wear handcrafted in Kuwait for women across the Gulf. Heritage fabrics, modern silhouettes, year-round elegance.</p>`;
const BODY_AR = `<p>اكتشفي أتيليه بلو مارين — درّاعات وبشوت وتصاميم سهرة فاخرة بصناعة يدوية من الكويت لنساء الخليج. أقمشة تراثية، تفصيل عصري، أناقة على مدار العام.</p>`;

const SEO_TITLE_EN = "Atelier Blue Marine — Luxury Khaleeji Daraas & Evening Wear";
const SEO_TITLE_AR = "أتيليه بلو مارين — درّاعات خليجية فاخرة وتصاميم سهرة";
const SEO_DESC_EN = "Handcrafted Khaleeji daraas, bishts and evening gowns from our atelier in Kuwait. Shipping across the GCC — Kuwait, Saudi, UAE, Qatar, Bahrain, Oman.";
const SEO_DESC_AR = "درّاعات وبشوت وفساتين سهرة خليجية بصناعة يدوية من ورشتنا في الكويت. شحن إلى جميع دول الخليج — الكويت، السعودية، الإمارات، قطر، البحرين، عُمان.";

const found = await gql(
  `query($q: String!) { collections(first: 1, query: $q) { edges { node { id title } } } }`,
  { q: `handle:${HANDLE}` },
);
const node = found.collections.edges[0]?.node;
if (!node) throw new Error("frontpage not found");

const upd = await gql(
  `mutation($input: CollectionInput!) {
    collectionUpdate(input: $input) {
      collection { id }
      userErrors { field message }
    }
  }`,
  {
    input: {
      id: node.id,
      descriptionHtml: BODY_EN,
      seo: { title: SEO_TITLE_EN, description: SEO_DESC_EN },
    },
  },
);
if (upd.collectionUpdate.userErrors.length) throw new Error(JSON.stringify(upd.collectionUpdate.userErrors));
console.log(`✅ EN body + SEO updated`);

await sleep(500);

const dig = await gql(
  `query($id: ID!) {
    translatableResource(resourceId: $id) {
      translatableContent { key digest }
    }
  }`,
  { id: node.id },
);
const digests = {};
for (const c of dig.translatableResource.translatableContent) digests[c.key] = c.digest;

const translations = [];
if (digests.body_html) translations.push({ key: "body_html", value: BODY_AR, locale: "ar", translatableContentDigest: digests.body_html });
if (digests.meta_title) translations.push({ key: "meta_title", value: SEO_TITLE_AR, locale: "ar", translatableContentDigest: digests.meta_title });
if (digests.meta_description) translations.push({ key: "meta_description", value: SEO_DESC_AR, locale: "ar", translatableContentDigest: digests.meta_description });

const reg = await gql(
  `mutation($id: ID!, $t: [TranslationInput!]!) {
    translationsRegister(resourceId: $id, translations: $t) {
      translations { key }
      userErrors { field message }
    }
  }`,
  { id: node.id, t: translations },
);
if (reg.translationsRegister.userErrors.length) throw new Error(JSON.stringify(reg.translationsRegister.userErrors));

console.log(`✅ AR translations registered: ${translations.map((t) => t.key).join(", ")}`);
