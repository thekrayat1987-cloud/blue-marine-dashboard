#!/usr/bin/env node
/**
 * Fix the missing meta_title on blue-marine-eau-de-parfum-50ml in EN + AR.
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

const HANDLE = "blue-marine-eau-de-parfum-50ml";
const SEO_TITLE_EN = "Blue Marine Eau de Parfum 50ml — Khaleeji Fragrance";
const SEO_TITLE_AR = "عطر بلو مارين 50 مل — عطر خليجي فاخر";

const found = await gql(
  `query($q: String!) {
    products(first: 1, query: $q) {
      edges { node { id title seo { title description } } }
    }
  }`,
  { q: `handle:${HANDLE}` },
);
const node = found.products.edges[0]?.node;
if (!node) throw new Error("product not found");
console.log(`Found: ${node.title} (${node.id})`);
console.log(`Existing SEO desc: ${node.seo?.description ? "(set)" : "(empty)"}`);

const upd = await gql(
  `mutation($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id }
      userErrors { field message }
    }
  }`,
  {
    input: {
      id: node.id,
      seo: {
        title: SEO_TITLE_EN,
        description: node.seo?.description || null,
      },
    },
  },
);
if (upd.productUpdate.userErrors.length) throw new Error(JSON.stringify(upd.productUpdate.userErrors));
console.log(`✅ EN meta_title set`);

await sleep(500);

const dig = await gql(
  `query($id: ID!) {
    translatableResource(resourceId: $id) {
      translatableContent { key digest }
    }
  }`,
  { id: node.id },
);
const digestEntry = dig.translatableResource.translatableContent.find((c) => c.key === "meta_title");
if (!digestEntry) throw new Error("meta_title digest still missing after update");

const reg = await gql(
  `mutation($id: ID!, $t: [TranslationInput!]!) {
    translationsRegister(resourceId: $id, translations: $t) {
      translations { key }
      userErrors { field message }
    }
  }`,
  {
    id: node.id,
    t: [{ key: "meta_title", value: SEO_TITLE_AR, locale: "ar", translatableContentDigest: digestEntry.digest }],
  },
);
if (reg.translationsRegister.userErrors.length) throw new Error(JSON.stringify(reg.translationsRegister.userErrors));
console.log(`✅ AR meta_title registered`);
