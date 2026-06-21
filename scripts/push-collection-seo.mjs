#!/usr/bin/env node
/**
 * Push EN + AR SEO (meta_title + meta_description) to existing collections.
 * 1) collectionUpdate sets EN seo.title / seo.description
 * 2) fetch fresh digests, then translationsRegister for AR
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

const COLLECTIONS = [
  {
    handle: "eau-de-parfum",
    enTitle: "Signature Fragrance — Khaleeji Eau de Parfum | Atelier Blue Marine",
    enDesc: "A warm, woody Gulf-inspired eau de parfum crafted to accompany every Atelier Blue Marine silhouette. Long-lasting, made for Khaleeji elegance.",
    arTitle: "عطر بلو مارين — أو دو بارفان خليجي | أتيليه بلو مارين",
    arDesc: "عطر دافئ بنفحات خشبية مستوحى من الخليج، صُمّم ليرافق تصاميم أتيليه بلو مارين. ثبات طويل وأناقة خليجية أصيلة.",
  },
  {
    handle: "one-piece-daraa",
    enTitle: "One-Piece Daraa — Khaleeji Gowns | Atelier Blue Marine",
    enDesc: "Single-piece daraas in luxurious fabrics with heritage embroidery. Versatile Gulf statement gowns for weddings, evenings and gatherings across the GCC.",
    arTitle: "درّاعة قطعة واحدة — تصاميم خليجية | أتيليه بلو مارين",
    arDesc: "درّاعات من قطعة واحدة بأقمشة فاخرة وتطريز تراثي. قطع خليجية مميّزة لحفلات الزفاف والسهرات والمناسبات في دول الخليج.",
  },
  {
    handle: "2-piece-set-daraa",
    enTitle: "Two-Piece Daraa Set — Inner Gown & Overlay | Atelier Blue Marine",
    enDesc: "Layered Khaleeji sets pairing a flowing inner daraa with an embellished overlay. Refined silhouettes for Gulf weddings, henna nights and formal evenings.",
    arTitle: "طقم درّاعة قطعتين — درّاعة وعباءة | أتيليه بلو مارين",
    arDesc: "أطقم درّاعة من قطعتين تجمع درّاعة انسيابية مع عباءة مطرّزة. تصاميم خليجية أنيقة لحفلات الزفاف وليالي الحناء والسهرات.",
  },
  {
    handle: "3-piece-daraa-set",
    enTitle: "Three-Piece Daraa Set — Ceremonial Gulf Sets | Atelier Blue Marine",
    enDesc: "Complete three-piece sets with inner daraa, overlay and accent piece. Designed for the most ceremonial Khaleeji occasions across the Gulf.",
    arTitle: "طقم درّاعة ثلاث قطع — تصاميم خليجية فاخرة | أتيليه بلو مارين",
    arDesc: "أطقم متكاملة من ثلاث قطع: درّاعة داخلية، عباءة وقطعة مكمّلة. أرقى التصاميم لأهم المناسبات الخليجية.",
  },
  {
    handle: "evening-collection",
    enTitle: "Evening Wear — Khaleeji Gowns & Gala Dresses | Atelier Blue Marine",
    enDesc: "Refined evening pieces designed for Gulf galas, henna nights and formal receptions. Luxury Khaleeji gowns in heritage fabrics and modern silhouettes.",
    arTitle: "تصاميم السهرة — فساتين خليجية فاخرة | أتيليه بلو مارين",
    arDesc: "تصاميم سهرة راقية لحفلات الزفاف وليالي الحناء والمناسبات الرسمية في الخليج. أناقة خليجية بأقمشة تراثية وتفصيل عصري.",
  },
  {
    handle: "new-collection",
    enTitle: "New Arrivals — Latest Khaleeji Designs | Atelier Blue Marine",
    enDesc: "The newest arrivals at Atelier Blue Marine — fresh Khaleeji silhouettes, fabrics and embroideries straight from our Kuwait atelier to the Gulf.",
    arTitle: "أحدث الوصولات — تصاميم خليجية جديدة | أتيليه بلو مارين",
    arDesc: "أحدث وصولات أتيليه بلو مارين — تصاميم وأقمشة وتطريزات خليجية جديدة من ورشتنا في الكويت إلى جميع دول الخليج.",
  },
];

async function findCollection(handle) {
  const d = await gql(
    `query($q: String!) { collections(first: 1, query: $q) { edges { node { id title } } } }`,
    { q: `handle:${handle}` },
  );
  return d.collections.edges[0]?.node || null;
}

async function updateSeoEN(id, title, description) {
  const d = await gql(
    `mutation($input: CollectionInput!) {
      collectionUpdate(input: $input) {
        collection { id }
        userErrors { field message }
      }
    }`,
    { input: { id, seo: { title, description } } },
  );
  const errs = d.collectionUpdate.userErrors;
  if (errs.length) throw new Error(JSON.stringify(errs));
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

console.log(`Pushing SEO (EN + AR) to ${COLLECTIONS.length} collections…\n`);
let ok = 0;
for (const c of COLLECTIONS) {
  try {
    const node = await findCollection(c.handle);
    if (!node) {
      console.log(`❌ ${c.handle.padEnd(22)} — not found`);
      continue;
    }
    await updateSeoEN(node.id, c.enTitle, c.enDesc);
    await sleep(400);
    const digests = await getDigests(node.id);
    const translations = [];
    if (digests.meta_title) translations.push({ key: "meta_title", value: c.arTitle, locale: "ar", translatableContentDigest: digests.meta_title });
    if (digests.meta_description) translations.push({ key: "meta_description", value: c.arDesc, locale: "ar", translatableContentDigest: digests.meta_description });
    if (translations.length === 0) throw new Error("no meta_title/meta_description digests after update");
    await registerAR(node.id, translations);
    console.log(`✅ ${c.handle.padEnd(22)} — ${node.title} (AR keys: ${translations.map((t) => t.key).join(", ")})`);
    ok += 1;
    await sleep(400);
  } catch (e) {
    console.log(`❌ ${c.handle.padEnd(22)} — ${e.message}`);
  }
}
console.log(`\nDone: ${ok}/${COLLECTIONS.length} collections updated.`);
