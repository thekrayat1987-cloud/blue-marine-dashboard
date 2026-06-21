#!/usr/bin/env node
/**
 * Create the "Bisht Noir Trio" collection in Shopify with EN + AR
 * (title, description, SEO) registered as translations.
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

const HANDLE = "bisht-noir-trio";
const TITLE_EN = "Bisht Noir Trio";
const TITLE_AR = "طقم البشت الأسود";

const BODY_EN = `<p>A statement three-piece Khaleeji set — a black bisht with silk-lined interior, an inner daraa, and a matching shawl. The most ceremonial silhouette in the Atelier Blue Marine line, designed for weddings, henna nights and grand Gulf occasions.</p>`;
const BODY_AR = `<p>طقم خليجي مميّز من ثلاث قطع — بشت أسود ببطانة من الحرير، درّاعة داخلية وشال متناسق. أرقى تصميم في أتيليه بلو مارين، صُمِّم لحفلات الزفاف، ليالي الحناء والمناسبات الكبرى في الخليج.</p>`;

const SEO_TITLE_EN = "Bisht Noir Trio — Three-Piece Black Bisht Set";
const SEO_TITLE_AR = "طقم البشت الأسود — ثلاث قطع";
const SEO_DESC_EN = "Luxury three-piece Khaleeji set: black bisht with silk lining, inner daraa, and matching shawl. Designed for weddings and ceremonial occasions across the Gulf.";
const SEO_DESC_AR = "طقم خليجي فاخر من ثلاث قطع: بشت أسود ببطانة حريرية، درّاعة داخلية وشال متناسق. لحفلات الزفاف والمناسبات الرسمية في دول الخليج.";

async function findExisting() {
  const d = await gql(
    `query($q: String!) { collections(first: 1, query: $q) { edges { node { id handle title } } } }`,
    { q: `handle:${HANDLE}` },
  );
  return d.collections.edges[0]?.node || null;
}

async function createCollection() {
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
  for (const c of d.translatableResource.translatableContent) {
    map[c.key] = c.digest;
  }
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
  process.exit(0);
}

const created = await createCollection();
console.log(`✅ Created collection: ${created.title} (${created.id}) handle=${created.handle}`);

await sleep(500);
const digests = await getDigests(created.id);

const translations = [];
if (digests.title) translations.push({ key: "title", value: TITLE_AR, locale: "ar", translatableContentDigest: digests.title });
if (digests.body_html) translations.push({ key: "body_html", value: BODY_AR, locale: "ar", translatableContentDigest: digests.body_html });
if (digests.meta_title) translations.push({ key: "meta_title", value: SEO_TITLE_AR, locale: "ar", translatableContentDigest: digests.meta_title });
if (digests.meta_description) translations.push({ key: "meta_description", value: SEO_DESC_AR, locale: "ar", translatableContentDigest: digests.meta_description });

await registerAR(created.id, translations);
console.log(`✅ Registered ${translations.length} AR translations: ${translations.map((t) => t.key).join(", ")}`);

console.log(`\nAdmin URL: https://${STORE}/admin/collections/${created.id.split("/").pop()}`);
