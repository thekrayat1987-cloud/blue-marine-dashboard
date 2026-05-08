// Recovery script: after apply-name-rename.mjs ran the EN updates, the AR side
// failed because Shopify's translatableContentDigest changed when the EN title
// was updated. This script re-fetches the FRESH digest then submits the AR
// translation with that fresh digest.
//
// Usage:
//   node --env-file=.env.local scripts/fix-ar-rename.mjs           # dry-run
//   node --env-file=.env.local scripts/fix-ar-rename.mjs --apply   # write
//
// For each SKU in dedupe-mapping-v2.json:
//   - read current AR title (still has the OLD model name)
//   - rewrite first Arabic word with new AR name
//   - re-fetch the digest (post-EN-update) so the registration is accepted
//
// Old AR name detection: pulled from dedupe-mapping-v2.json's manuals via the
// current AR translation's first word.

import { readFile } from "node:fs/promises";

const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
if (!STORE || !TOKEN) { console.error("Missing env"); process.exit(1); }
const APPLY = process.argv.includes("--apply");
const ENDPOINT = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

async function gql(q, v) {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query: q, variables: v }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const mapping = JSON.parse(
  await readFile(new URL("../dedupe-mapping-v2.json", import.meta.url), "utf8"),
);

// Map old Arabic first names → new AR name. We don't know the old AR name from
// the mapping alone, so we read it from the current AR translation per product.
function rewriteFirstWord(text, newWord) {
  return text.replace(/^([A-Z]\d+\s*[–-]\s*)\S+/, `$1${newWord}`);
}
function getOldFirstWord(text) {
  return text.match(/^[A-Z]\d+\s*[–-]\s*(\S+)/)?.[1] || "";
}

let ok = 0, errors = 0, skipped = 0;
for (const r of mapping.renames) {
  // Find the product (current title now uses new EN name, e.g. "A10 – Hessa 3-Piece Bisht Set")
  const d = await gql(
    `query($q: String!) { products(first: 1, query: $q) { edges { node {
      id title
    } } } }`,
    { q: `title:${r.sku}*` },
  );
  const node = d.products.edges.find((e) => e.node.title.startsWith(`${r.sku} `))?.node;
  if (!node) {
    console.log(`⚠ ${r.sku} not found`);
    skipped++;
    continue;
  }
  // Re-fetch translatable resource (digest will now match the NEW EN title)
  const t = await gql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key value digest }
        translations(locale: "ar") { key value }
      }
    }`,
    { id: node.id },
  );
  const enContent = Object.fromEntries(
    (t.translatableResource?.translatableContent || []).map((c) => [c.key, c]),
  );
  const ar = Object.fromEntries(
    (t.translatableResource?.translations || []).map((x) => [x.key, x.value]),
  );

  const oldArTitle = ar.title || "";
  if (!oldArTitle) {
    console.log(`⚠ ${r.sku} has no AR title — skip`);
    skipped++;
    continue;
  }
  const oldFirstAr = getOldFirstWord(oldArTitle);
  if (!oldFirstAr) {
    console.log(`⚠ ${r.sku} could not parse AR first word — skip`);
    skipped++;
    continue;
  }
  // If AR first word already equals the new AR name, nothing to do
  if (oldFirstAr === r.ar) {
    console.log(`= ${r.sku} AR already up to date`);
    skipped++;
    continue;
  }

  const newArTitle = rewriteFirstWord(oldArTitle, r.ar);
  const newArMetaT = (ar.meta_title || "").replaceAll(oldFirstAr, r.ar);
  const newArMetaD = (ar.meta_description || "").replaceAll(oldFirstAr, r.ar);

  console.log(`${r.sku}  ${oldArTitle}  →  ${newArTitle}`);

  if (!APPLY) continue;

  const arPayload = [];
  const push = (key, value) => {
    const c = enContent[key];
    if (!c?.digest || !value) return;
    arPayload.push({ locale: "ar", key, value, translatableContentDigest: c.digest });
  };
  push("title", newArTitle);
  if (newArMetaT && newArMetaT !== ar.meta_title) push("meta_title", newArMetaT);
  if (newArMetaD && newArMetaD !== ar.meta_description) push("meta_description", newArMetaD);

  if (!arPayload.length) { skipped++; continue; }

  const resp = await gql(
    `mutation($id: ID!, $t: [TranslationInput!]!) {
      translationsRegister(resourceId: $id, translations: $t) {
        translations { key }
        userErrors { field message }
      }
    }`,
    { id: node.id, t: arPayload },
  );
  if (resp.translationsRegister.userErrors.length) {
    console.log(`✗ ${r.sku}: ${JSON.stringify(resp.translationsRegister.userErrors)}`);
    errors++;
  } else {
    ok++;
  }
}

console.log(`\n${APPLY ? "Applied" : "Would update"}: ${ok}  |  Skipped: ${skipped}  |  Errors: ${errors}`);
