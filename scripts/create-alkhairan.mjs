#!/usr/bin/env node
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

const HANDLE = "alkhairan";
const TITLE_EN = "AlKhairan";
const TITLE_AR = "الخيران";

const BODY_EN = `<p>A capsule of breezy two-piece sets made for the Gulf summer. From sun-soaked mornings at the chalet to long evenings by the water — flowing daraas and caftans in soft pastels and lightweight fabrics, designed to travel.</p>`;
const BODY_AR = `<p>مجموعة مختارة من الأطقم الخفيفة من قطعتين، صُمِّمت لأجواء صيف الخليج. من صباحات الشاليه المشمسة إلى أمسيات الساحل الطويلة — درّاعات وقفاطين بقصّات منسابة، بألوان باستيل ناعمة وأقمشة خفيفة، رفيقة المسافر.</p>`;

const SEO_TITLE_EN = "AlKhairan — Summer Resort Sets | Atelier Blue Marine";
const SEO_TITLE_AR = "الخيران — أطقم صيف الخليج | أتيليه بلو مارين";
const SEO_DESC_EN = "Lightweight two-piece daraas and caftans in soft pastels — Atelier Blue Marine's summer resort capsule, made for the Gulf coast and travel across the GCC.";
const SEO_DESC_AR = "أطقم خفيفة من قطعتين، درّاعات وقفاطين بألوان باستيل ناعمة — مجموعة الصيف من أتيليه بلو مارين لرحلات الخليج والساحل.";

const SKUS = ["A140", "A141", "A142", "A143"];

async function findExisting() {
  const d = await gql(
    `query($q: String!) { collections(first: 1, query: $q) { edges { node { id handle title } } } }`,
    { q: `handle:${HANDLE}` },
  );
  return d.collections.edges[0]?.node || null;
}

async function findProductIdsBySku(skus) {
  const ids = [];
  for (const sku of skus) {
    const d = await gql(
      `query($q: String!) { products(first: 5, query: $q) { edges { node { id title handle } } } }`,
      { q: `sku:${sku}` },
    );
    const node = d.products.edges[0]?.node;
    if (!node) {
      console.warn(`⚠️  No product found for SKU ${sku}`);
      continue;
    }
    console.log(`  • ${sku} → ${node.title} (${node.id})`);
    ids.push(node.id);
  }
  return ids;
}

async function createCollection(productIds) {
  const d = await gql(
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
        descriptionHtml: BODY_EN,
        seo: { title: SEO_TITLE_EN, description: SEO_DESC_EN },
        products: productIds,
      },
    },
  );
  const errs = d.collectionCreate.userErrors;
  if (errs.length) throw new Error(JSON.stringify(errs));
  return d.collectionCreate.collection;
}

async function getDigests(id) {
  const d = await gql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key digest locale value }
      }
    }`,
    { id },
  );
  const map = {};
  for (const c of d.translatableResource.translatableContent) map[c.key] = c.digest;
  return map;
}

async function registerAR(id, translations) {
  const d = await gql(
    `mutation($id: ID!, $t: [TranslationInput!]!) {
      translationsRegister(resourceId: $id, translations: $t) {
        translations { key }
        userErrors { field message }
      }
    }`,
    { id, t: translations },
  );
  const errs = d.translationsRegister.userErrors;
  if (errs.length) throw new Error(JSON.stringify(errs));
}

const existing = await findExisting();
if (existing) {
  console.log(`ℹ️  Collection already exists: ${existing.handle} (${existing.id})`);
  console.log(`Run with FORCE=1 to skip this guard if you really want to recreate.`);
  process.exit(0);
}

console.log("Resolving products by SKU...");
const productIds = await findProductIdsBySku(SKUS);
if (productIds.length === 0) throw new Error("No products resolved — aborting");
console.log(`✅ Resolved ${productIds.length}/${SKUS.length} products`);

console.log("\nCreating collection...");
const created = await createCollection(productIds);
console.log(`✅ Created: ${created.title} (${created.id}) handle=${created.handle}`);

await sleep(800);
console.log("\nRegistering AR translations...");
const digests = await getDigests(created.id);

const translations = [];
if (digests.title) translations.push({ key: "title", value: TITLE_AR, locale: "ar", translatableContentDigest: digests.title });
if (digests.body_html) translations.push({ key: "body_html", value: BODY_AR, locale: "ar", translatableContentDigest: digests.body_html });
if (digests.meta_title) translations.push({ key: "meta_title", value: SEO_TITLE_AR, locale: "ar", translatableContentDigest: digests.meta_title });
if (digests.meta_description) translations.push({ key: "meta_description", value: SEO_DESC_AR, locale: "ar", translatableContentDigest: digests.meta_description });

await registerAR(created.id, translations);
console.log(`✅ Registered ${translations.length} AR translations: ${translations.map((t) => t.key).join(", ")}`);

console.log(`\nCollection GID: ${created.id}`);
console.log(`Numeric ID:    ${created.id.split("/").pop()}`);
console.log(`Admin URL:     https://${STORE}/admin/collections/${created.id.split("/").pop()}`);
console.log(`Storefront:    https://bluemarineatelier.com/collections/${created.handle}`);
