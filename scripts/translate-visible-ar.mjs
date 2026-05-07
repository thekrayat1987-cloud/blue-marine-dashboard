#!/usr/bin/env node
/**
 * Register the remaining storefront-visible Arabic translations:
 *   - Product option names: Size, Color, Length in inch
 *   - Customer account "Profile" link
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

const MUTATION = `
  mutation translationsRegister($resourceId: ID!, $translations: [TranslationInput!]!) {
    translationsRegister(resourceId: $resourceId, translations: $translations) {
      userErrors { message field }
      translations { key value locale }
    }
  }
`;

const TASKS = [
  {
    label: "ProductOption Size",
    resourceId: "gid://shopify/ProductOption/12703003083052",
    key: "name",
    digest: "1af851907331c0ed99e7c63b4e55df808bc5fc4c990a1cf80ca8c0f76daf1f3b",
    ar: "المقاس",
  },
  {
    label: "ProductOption Length in inch",
    resourceId: "gid://shopify/ProductOption/12703003115820",
    key: "name",
    digest: "c9df7686b5dd16e6391c7ff3b45c07c444d874beb40ff8b7a40d0791ee1dc219",
    ar: "الطول بالبوصة",
  },
  {
    label: "ProductOption Color #1",
    resourceId: "gid://shopify/ProductOption/12763695841580",
    key: "name",
    digest: "6b73191a0a4b67420e61d51c9f207c35277eaf18fbbf5beb52a320a23fe09653",
    ar: "اللون",
  },
  {
    label: "ProductOption Color #2",
    resourceId: "gid://shopify/ProductOption/12805287182636",
    key: "name",
    digest: "6b73191a0a4b67420e61d51c9f207c35277eaf18fbbf5beb52a320a23fe09653",
    ar: "اللون",
  },
  {
    label: "Link Profile",
    resourceId: "gid://shopify/Link/753960255788",
    key: "title",
    digest: "d696a35bdd1883da07a8d6c41bb7a3153381b23aa197629ee273479a6eaa5a9c",
    ar: "حسابي",
  },
];

for (const t of TASKS) {
  const j = await gql(MUTATION, {
    resourceId: t.resourceId,
    translations: [
      { key: t.key, value: t.ar, locale: "ar", translatableContentDigest: t.digest },
    ],
  });
  const errs = j.data?.translationsRegister?.userErrors;
  if (errs && errs.length) {
    console.log(`❌ ${t.label}: ${JSON.stringify(errs)}`);
  } else if (j.errors) {
    console.log(`❌ ${t.label}: ${JSON.stringify(j.errors)}`);
  } else {
    console.log(`✅ ${t.label}: ${t.ar}`);
  }
}
