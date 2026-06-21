#!/usr/bin/env node
/**
 * RESUME: Continue backfill after ECONNRESET. Adds retry-with-backoff to
 * every Shopify call. Re-runs AR translations across all 20 products
 * (idempotent — translationsRegister overwrites with same digest+value).
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

const URL_ = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${process.env.SHOPIFY_API_VERSION || "2024-10"}/graphql.json`;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

async function gql(q, v = {}, attempt = 0) {
  try {
    const r = await fetch(URL_, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
      body: JSON.stringify({ query: q, variables: v }),
    });
    const j = await r.json();
    if (j.errors) throw new Error(JSON.stringify(j.errors));
    return j.data;
  } catch (e) {
    if (attempt >= 5) throw e;
    const delay = 500 * Math.pow(2, attempt);
    process.stderr.write(`  retry ${attempt + 1} after ${delay}ms (${e.message})\n`);
    await new Promise((r) => setTimeout(r, delay));
    return gql(q, v, attempt + 1);
  }
}

const COLOR_BY_HANDLE = {
  "a51-bahar-bisht-set": "black",
  "a52-bahar-black-bisht-set": "black",
  "a53-amira-olive-gold-bisht-set": "olive gold",
  "a54-bahar-bisht-set": "burgundy",
  "a56-yaqut-burgundy-bisht-set": "burgundy",
  "a57-bahar-bisht-set": "black",
  "a80-amira-velvet-bisht-set": "black",
  "a81-sahar-velvet-bisht": "navy",
  "a85-sahar-dawn-daraa-bisht-set": "ivory",
  "a110-sahar-black-bisht": "black",
  "a118-dana-daraa-bisht-set": "black",
  "a119-amira-daraa-bisht-set": "black",
  "a135-durra-bisht-set": "black",
  "a136-mosaic-bisht-3-piece-set": "black",
  "a137-shurooq-bisht-set": "black",
  "a138-mahra-bisht-set": "black",
  "a139-khawla-bisht-set": "black",
  "a144-lujain-bisht-set": "black",
  "a145-banan-bisht-set": "black",
  "a146-aroob-bisht-set": "black",
};

const AR_COLOR = {
  black: "أسود",
  burgundy: "عنابي",
  navy: "كحلي",
  ivory: "عاجي",
  "olive gold": "ذهبي زيتي",
};

// Resume from a137 (a51..a136 already written)
const RESUME_FROM_INDEX = Object.keys(COLOR_BY_HANDLE).indexOf("a137-shurooq-bisht-set");

async function fetchProduct(handle) {
  const d = await gql(
    `query($q: String!) {
      products(first: 1, query: $q) {
        edges { node {
          id handle title
          variants(first: 250) { edges { node { id title } } pageInfo { hasNextPage endCursor } }
        } }
      }
    }`,
    { q: `handle:${handle}` },
  );
  const node = d.products.edges[0]?.node;
  if (!node) return null;
  const variants = [...node.variants.edges.map((e) => e.node)];
  let pi = node.variants.pageInfo;
  while (pi.hasNextPage) {
    const more = await gql(
      `query($id:ID!, $cursor:String){
        product(id:$id){ variants(first:250, after:$cursor){
          pageInfo{ hasNextPage endCursor } edges{ node{ id title } }
        } }
      }`,
      { id: node.id, cursor: pi.endCursor },
    );
    for (const e of more.product.variants.edges) variants.push(e.node);
    pi = more.product.variants.pageInfo;
  }
  return { ...node, variants };
}

async function setVariantColorMetafield(variantId, colorEn) {
  const d = await gql(
    `mutation($metafields:[MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id }
        userErrors { field message code }
      }
    }`,
    {
      metafields: [
        {
          ownerId: variantId,
          namespace: "mm-google-shopping",
          key: "color",
          type: "single_line_text_field",
          value: colorEn,
        },
      ],
    },
  );
  if (d.metafieldsSet.userErrors.length) {
    throw new Error(JSON.stringify(d.metafieldsSet.userErrors));
  }
  return d.metafieldsSet.metafields[0];
}

async function registerArMetafieldTranslation(metafieldId, arValue) {
  const tr = await gql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key value digest locale }
      }
    }`,
    { id: metafieldId },
  );
  const valueContent = tr.translatableResource?.translatableContent.find((c) => c.key === "value");
  if (!valueContent) return { skipped: true };
  const res = await gql(
    `mutation($resourceId: ID!, $translations: [TranslationInput!]!) {
      translationsRegister(resourceId: $resourceId, translations: $translations) {
        userErrors { field message }
      }
    }`,
    {
      resourceId: metafieldId,
      translations: [
        { locale: "ar", key: "value", value: arValue, translatableContentDigest: valueContent.digest },
      ],
    },
  );
  if (res.translationsRegister.userErrors.length) {
    return { warning: res.translationsRegister.userErrors };
  }
  return { ok: true };
}

let writtenVariants = 0;
let translationsOk = 0;
let translationsFail = 0;
const failures = [];
const handles = Object.keys(COLOR_BY_HANDLE);

// Phase 1: write metafields for resume products only
console.log(`Phase 1: writing metafields for products from index ${RESUME_FROM_INDEX} (${handles[RESUME_FROM_INDEX]}) onward`);
for (let i = RESUME_FROM_INDEX; i < handles.length; i++) {
  const handle = handles[i];
  const colorEn = COLOR_BY_HANDLE[handle];
  process.stderr.write(`[${i + 1}/${handles.length}] ${handle} → ${colorEn}\n`);
  try {
    const product = await fetchProduct(handle);
    if (!product) {
      failures.push({ handle, error: "not found" });
      continue;
    }
    for (const v of product.variants) {
      try {
        await setVariantColorMetafield(v.id, colorEn);
        writtenVariants++;
      } catch (e) {
        failures.push({ handle, variantId: v.id, variantTitle: v.title, error: String(e.message || e) });
      }
    }
    process.stderr.write(`  wrote ${product.variants.length} variants\n`);
  } catch (e) {
    failures.push({ handle, error: String(e.message || e) });
  }
}

// Phase 2: AR translations for ALL 20 products (idempotent)
console.log(`\nPhase 2: AR translations for all ${handles.length} products`);
for (let i = 0; i < handles.length; i++) {
  const handle = handles[i];
  const colorEn = COLOR_BY_HANDLE[handle];
  const arVal = AR_COLOR[colorEn];
  process.stderr.write(`[${i + 1}/${handles.length}] AR ${handle} → ${arVal}\n`);
  try {
    const product = await fetchProduct(handle);
    if (!product) continue;
    const d = await gql(
      `query($id: ID!) {
        product(id: $id) {
          variants(first: 250) {
            edges { node { id mf: metafield(namespace:"mm-google-shopping", key:"color") { id value } } }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`,
      { id: product.id },
    );
    let edges = d.product.variants.edges;
    let pi = d.product.variants.pageInfo;
    while (pi.hasNextPage) {
      const more = await gql(
        `query($id:ID!, $cursor:String){
          product(id:$id){ variants(first:250, after:$cursor){
            pageInfo{ hasNextPage endCursor }
            edges{ node{ id mf: metafield(namespace:"mm-google-shopping", key:"color"){ id value } } }
          } }
        }`,
        { id: product.id, cursor: pi.endCursor },
      );
      edges = edges.concat(more.product.variants.edges);
      pi = more.product.variants.pageInfo;
    }
    for (const e of edges) {
      const mf = e.node.mf;
      if (!mf?.id) continue;
      try {
        const r = await registerArMetafieldTranslation(mf.id, arVal);
        if (r.ok) translationsOk++;
        else translationsFail++;
      } catch (err) {
        translationsFail++;
        failures.push({ handle, mfId: mf.id, error: String(err.message || err) });
      }
    }
    process.stderr.write(`  AR translations: ${edges.length} variants processed\n`);
  } catch (e) {
    failures.push({ handle, phase: "ar", error: String(e.message || e) });
  }
}

const summary = {
  generated_at: new Date().toISOString(),
  resume_from: handles[RESUME_FROM_INDEX],
  written_variants_phase1: writtenVariants,
  ar_translations_ok: translationsOk,
  ar_translations_fail: translationsFail,
  failures,
};
writeFileSync(
  resolve(__dirname, "..", "backfill-bisht-variant-colors-resume.log.json"),
  JSON.stringify(summary, null, 2),
);
console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(summary, null, 2));
