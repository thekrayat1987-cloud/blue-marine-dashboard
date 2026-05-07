#!/usr/bin/env node
/**
 * Find checkout keys that are in the checkpoint as "pushed" but where the
 * AR translation is actually missing in Shopify, then re-push them.
 * Shopify's translationsRegister sometimes silently drops entries from a
 * batch without raising userErrors. This script reconciles.
 */
import { readFileSync, writeFileSync } from "node:fs";
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
const PUSH_BATCH = 25;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

console.log("Fetching current state...");
const data = await gql(
  `query($id: ID!) {
    translatableResource(resourceId: $id) {
      translatableContent { key value digest }
      translations(locale: "ar") { key }
    }
  }`,
  { id: RID },
);

const enContent = data.translatableResource.translatableContent;
const arKeys = new Set(data.translatableResource.translations.map((t) => t.key));

const enByKey = new Map(enContent.map((c) => [c.key, c]));
const cp = JSON.parse(readFileSync(resolve(__dirname, ".checkout-ar-checkpoint.json"), "utf8"));

// Find keys that the checkpoint claims were pushed but are not in arKeys
const missing = [];
for (const key of cp.pushedKeys) {
  if (arKeys.has(key)) continue;
  const c = enByKey.get(key);
  if (!c) continue; // key no longer exists
  // Find the translation we recorded for that key's EN value
  const ar = cp.translatedByEn[c.value];
  if (!ar || ar === c.value) continue; // no usable translation
  missing.push({ locale: "ar", key, value: ar, translatableContentDigest: c.digest });
}

console.log(`Total checkpoint pushedKeys: ${cp.pushedKeys.length}`);
console.log(`Already registered in Shopify: ${cp.pushedKeys.filter((k) => arKeys.has(k)).length}`);
console.log(`Missing (need re-push): ${missing.length}`);

if (missing.length === 0) {
  console.log("Nothing to repush. ✓");
  process.exit(0);
}

let registered = 0;
const totalBatches = Math.ceil(missing.length / PUSH_BATCH);
for (let i = 0; i < missing.length; i += PUSH_BATCH) {
  const slice = missing.slice(i, i + PUSH_BATCH);
  const n = Math.floor(i / PUSH_BATCH) + 1;
  process.stdout.write(`[${n}/${totalBatches}] Re-pushing ${slice.length}... `);
  try {
    const res = await gql(
      `mutation($id: ID!, $t: [TranslationInput!]!) {
        translationsRegister(resourceId: $id, translations: $t) {
          translations { key }
          userErrors { field message }
        }
      }`,
      { id: RID, t: slice },
    );
    const got = res.translationsRegister.translations.length;
    registered += got;
    if (res.translationsRegister.userErrors.length) {
      console.log(`registered=${got}, errors=${res.translationsRegister.userErrors.length}`);
      for (const e of res.translationsRegister.userErrors.slice(0, 3))
        console.log(`   ${e.field?.join(".")} :: ${e.message}`);
    } else {
      console.log(`registered=${got}/${slice.length}${got < slice.length ? " ⚠ partial!" : ""}`);
    }
  } catch (e) {
    console.log(`FAIL: ${e.message}`);
    await sleep(2000);
  }
  await sleep(400);
}

console.log(`\nDone. Re-registered: ${registered} / ${missing.length}`);
