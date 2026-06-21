#!/usr/bin/env node
/**
 * BACKFILL: Set mm-google-shopping.color metafield on every variant of the
 * 20 bisht-set products, mapped from the approved color table. Also adds
 * "ivory" tag to A85 (currently missing a base color tag) and registers
 * Arabic translations for each metafield value.
 *
 * Source of truth: dashboard/bisht-vision-color-audit.json + manual A85 decision.
 * No prompts; runs all writes. DRY_RUN=1 to preview.
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
const DRY = process.env.DRY_RUN === "1";

async function gql(q, v = {}) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query: q, variables: v }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

// Approved EN color per product handle (from the table the user confirmed).
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

const log = [];
function record(ev) {
  log.push({ ts: new Date().toISOString(), ...ev });
  console.log(JSON.stringify(ev));
}

// Resolve product GIDs by handle and grab tags + variant ids.
async function fetchProduct(handle) {
  const d = await gql(
    `query($q: String!) {
      products(first: 1, query: $q) {
        edges { node {
          id handle title tags
          variants(first: 250) {
            pageInfo { hasNextPage endCursor }
            edges { node { id title } }
          }
        } }
      }
    }`,
    { q: `handle:${handle}` },
  );
  const node = d.products.edges[0]?.node;
  if (!node) return null;
  const variants = [...node.variants.edges.map((e) => e.node)];
  if (node.variants.pageInfo.hasNextPage) {
    let cursor = node.variants.pageInfo.endCursor;
    while (true) {
      const more = await gql(
        `query($id:ID!, $cursor:String){
          product(id:$id){ variants(first:250, after:$cursor){
            pageInfo{ hasNextPage endCursor }
            edges{ node{ id title } }
          } }
        }`,
        { id: node.id, cursor },
      );
      for (const e of more.product.variants.edges) variants.push(e.node);
      if (!more.product.variants.pageInfo.hasNextPage) break;
      cursor = more.product.variants.pageInfo.endCursor;
    }
  }
  return { ...node, variants };
}

async function addTag(productId, currentTags, tagToAdd) {
  if (currentTags.includes(tagToAdd)) return { skipped: true };
  if (DRY) return { dryRun: true };
  const newTags = [...currentTags, tagToAdd];
  const d = await gql(
    `mutation($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id tags }
        userErrors { field message }
      }
    }`,
    { input: { id: productId, tags: newTags } },
  );
  if (d.productUpdate.userErrors.length) {
    throw new Error(`addTag userErrors: ${JSON.stringify(d.productUpdate.userErrors)}`);
  }
  return { newTags };
}

async function setVariantColorMetafield(variantId, colorEn) {
  if (DRY) return { dryRun: true, variantId, colorEn };
  const d = await gql(
    `mutation($metafields:[MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id key namespace value }
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
    throw new Error(`metafieldsSet userErrors: ${JSON.stringify(d.metafieldsSet.userErrors)}`);
  }
  return d.metafieldsSet.metafields[0];
}

async function registerArMetafieldTranslation(metafieldId, arValue) {
  if (DRY) return { dryRun: true, metafieldId, arValue };
  const tr = await gql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key value digest locale }
      }
    }`,
    { id: metafieldId },
  );
  const valueContent = tr.translatableResource?.translatableContent.find(
    (c) => c.key === "value",
  );
  if (!valueContent) return { skipped: "no translatable content" };
  const res = await gql(
    `mutation($resourceId: ID!, $translations: [TranslationInput!]!) {
      translationsRegister(resourceId: $resourceId, translations: $translations) {
        userErrors { field message }
      }
    }`,
    {
      resourceId: metafieldId,
      translations: [
        {
          locale: "ar",
          key: "value",
          value: arValue,
          translatableContentDigest: valueContent.digest,
        },
      ],
    },
  );
  if (res.translationsRegister.userErrors.length) {
    return { warning: res.translationsRegister.userErrors };
  }
  return { ok: true };
}

let totalVariants = 0;
let writtenVariants = 0;
let translationsOk = 0;
let translationsFail = 0;
const failures = [];

for (const [handle, colorEn] of Object.entries(COLOR_BY_HANDLE)) {
  const arVal = AR_COLOR[colorEn];
  if (!arVal) {
    record({ handle, error: `no AR mapping for color "${colorEn}"` });
    continue;
  }
  const product = await fetchProduct(handle);
  if (!product) {
    record({ handle, error: "product not found" });
    continue;
  }

  // 1. Add ivory tag for A85
  if (handle === "a85-sahar-dawn-daraa-bisht-set") {
    try {
      const tagRes = await addTag(product.id, product.tags, "ivory");
      record({ handle, step: "add_tag", color: "ivory", result: tagRes });
    } catch (e) {
      record({ handle, step: "add_tag", error: String(e.message || e) });
    }
  }

  totalVariants += product.variants.length;
  let firstMetafieldId = null;
  for (const v of product.variants) {
    try {
      const mf = await setVariantColorMetafield(v.id, colorEn);
      writtenVariants++;
      if (!firstMetafieldId && mf?.id) firstMetafieldId = mf.id;
    } catch (e) {
      failures.push({ handle, variantId: v.id, variantTitle: v.title, error: String(e.message || e) });
    }
  }

  // Register AR translation per variant metafield. Need to fetch all metafield
  // ids first since metafieldsSet returns one at a time inside the loop above.
  // Simpler: re-query and translate all variant color metafields.
  if (!DRY) {
    const d = await gql(
      `query($id: ID!) {
        product(id: $id) {
          variants(first: 250) {
            edges { node {
              id
              mf: metafield(namespace:"mm-google-shopping", key:"color") { id value }
            } }
          }
        }
      }`,
      { id: product.id },
    );
    for (const e of d.product.variants.edges) {
      const mf = e.node.mf;
      if (!mf?.id) continue;
      const trRes = await registerArMetafieldTranslation(mf.id, arVal);
      if (trRes.ok) translationsOk++;
      else translationsFail++;
    }
  }

  record({
    handle,
    step: "summary",
    color_en: colorEn,
    color_ar: arVal,
    variant_count: product.variants.length,
    written: writtenVariants,
  });
}

const summary = {
  generated_at: new Date().toISOString(),
  dry_run: DRY,
  products_processed: Object.keys(COLOR_BY_HANDLE).length,
  total_variants: totalVariants,
  written_variants: writtenVariants,
  ar_translations_ok: translationsOk,
  ar_translations_fail: translationsFail,
  failures,
};

writeFileSync(
  resolve(__dirname, "..", "backfill-bisht-variant-colors.log.json"),
  JSON.stringify({ summary, log }, null, 2),
);

console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(summary, null, 2));
