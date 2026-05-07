#!/usr/bin/env node
/**
 * Push EN + AR descriptions to Blue Marine Shopify collections.
 * EN goes via collectionUpdate; AR via translationsRegister using the
 * fresh body_html digest (digest changes whenever the source changes).
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
    en: "A signature scent crafted to accompany every Blue Marine silhouette — woody, warm, and unmistakably Gulf.",
    ar: "عطر مميّز صُمِّم ليرافق كل تصميم من بلو مارين — دافئ، خشبي، وبلمسة خليجية أصيلة.",
  },
  {
    handle: "one-piece-daraa",
    en: "Single-piece daraas in luxurious fabrics and heritage embroidery — versatile statement pieces for every Gulf occasion.",
    ar: "درّاعات من قطعة واحدة بأقمشة فاخرة وتطريز تراثي — قطع مميّزة تناسب جميع المناسبات الخليجية.",
  },
  {
    handle: "2-piece-set-daraa",
    en: "Two-piece daraa sets pairing a flowing inner gown with an embellished overlay — the modern Khaleeji silhouette for weddings, evenings and gatherings.",
    ar: "أطقم درّاعة من قطعتين تجمع بين الفستان الانسيابي والعباءة المطرّزة — أناقة خليجية معاصرة لحفلات الزفاف، السهرات والمناسبات.",
  },
  {
    handle: "3-piece-daraa-set",
    en: "Complete three-piece sets — inner daraa, overlay and accent piece — for the most ceremonial Gulf occasions.",
    ar: "أطقم متكاملة من ثلاث قطع — درّاعة، عباءة وقطعة مكمّلة — لأرقى المناسبات الخليجية.",
  },
  {
    handle: "evening-collection",
    en: "Refined evening pieces designed for galas, henna nights and formal receptions across the Gulf.",
    ar: "تصاميم سهرة راقية لحفلات الزفاف، ليالي الحناء والمناسبات الرسمية في الخليج.",
  },
  {
    handle: "new-collection",
    en: "The newest arrivals at Atelier Blue Marine — fresh silhouettes, fabrics and embroideries straight from our atelier.",
    ar: "أحدث وصولات أتيليه بلو مارين — تصاميم وأقمشة وتطريزات جديدة مباشرةً من ورشتنا.",
  },
];

async function getCollectionId(handle) {
  const d = await gql(
    `query($q: String!) { collections(first: 1, query: $q) { edges { node { id title } } } }`,
    { q: `handle:${handle}` },
  );
  const edge = d.collections.edges[0];
  if (!edge) throw new Error(`Collection not found: ${handle}`);
  return edge.node;
}

async function updateCollectionEN(id, html) {
  const d = await gql(
    `mutation($input: CollectionInput!) {
      collectionUpdate(input: $input) {
        collection { id }
        userErrors { field message }
      }
    }`,
    { input: { id, descriptionHtml: html } },
  );
  const errs = d.collectionUpdate.userErrors;
  if (errs.length) throw new Error(JSON.stringify(errs));
}

async function getBodyHtmlDigest(id) {
  const d = await gql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key digest locale value }
      }
    }`,
    { id },
  );
  const entry = d.translatableResource.translatableContent.find((c) => c.key === "body_html");
  if (!entry) throw new Error("body_html not found in translatable content");
  return entry.digest;
}

async function registerAR(id, digest, ar) {
  const d = await gql(
    `mutation($id: ID!, $t: [TranslationInput!]!) {
      translationsRegister(resourceId: $id, translations: $t) {
        translations { key }
        userErrors { field message }
      }
    }`,
    {
      id,
      t: [{ key: "body_html", value: ar, locale: "ar", translatableContentDigest: digest }],
    },
  );
  const errs = d.translationsRegister.userErrors;
  if (errs.length) throw new Error(JSON.stringify(errs));
}

console.log(`Pushing descriptions to ${COLLECTIONS.length} collections…\n`);
let ok = 0;
for (const c of COLLECTIONS) {
  try {
    const node = await getCollectionId(c.handle);
    const html = `<p>${c.en}</p>`;
    await updateCollectionEN(node.id, html);
    await sleep(400);
    const digest = await getBodyHtmlDigest(node.id);
    const arHtml = `<p>${c.ar}</p>`;
    await registerAR(node.id, digest, arHtml);
    console.log(`✅ ${c.handle.padEnd(22)} — ${node.title}`);
    ok += 1;
    await sleep(400);
  } catch (e) {
    console.log(`❌ ${c.handle.padEnd(22)} — ${e.message}`);
  }
}
console.log(`\nDone: ${ok}/${COLLECTIONS.length} collections updated.`);
