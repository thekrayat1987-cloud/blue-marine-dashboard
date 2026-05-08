// Direction β rename: replace the first word (model name) of each duplicate
// product's title with a unique Khaleeji feminine name. Updates EN title,
// AR title translation, SEO title/description (EN + AR), and replaces any tag
// that exactly matches the old first-word.
//
// Usage:
//   node --env-file=.env.local scripts/apply-name-rename.mjs           # dry-run
//   node --env-file=.env.local scripts/apply-name-rename.mjs --apply   # write

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
const bySku = Object.fromEntries(mapping.renames.map((r) => [r.sku, r]));

// Replace the first word after "{SKU} – " with the new name (EN).
function rewriteEn(title, newName) {
  return title.replace(/^([A-Z]\d+\s*[–-]\s*)\S+/, `$1${newName}`);
}
// Same for AR title (the SKU prefix is the same; first Arabic token follows).
function rewriteAr(title, newArName) {
  return title.replace(/^([A-Z]\d+\s*[–-]\s*)\S+/, `$1${newArName}`);
}
function getOldFirstWord(title) {
  return title.match(/^[A-Z]\d+\s*[–-]\s*(\S+)/)?.[1] || "";
}
function getOldFirstArWord(title) {
  return title.match(/^[A-Z]\d+\s*[–-]\s*(\S+)/)?.[1] || "";
}

console.log(`Loading ${mapping.renames.length} renames…`);

// Fetch each product by SKU prefix
const proposals = [];
for (const r of mapping.renames) {
  const d = await gql(
    `query($q: String!) { products(first: 1, query: $q) { edges { node {
      id title handle tags
      seo { title description }
    } } } }`,
    { q: `title:${r.sku}*` },
  );
  const node = d.products.edges.find((e) => e.node.title.startsWith(`${r.sku} `))?.node;
  if (!node) {
    console.warn(`⚠ ${r.sku} not found`);
    continue;
  }
  // Fetch AR translation
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

  const oldFirstEn = getOldFirstWord(node.title);
  const oldFirstAr = ar.title ? getOldFirstArWord(ar.title) : "";

  const newEnTitle = rewriteEn(node.title, r.en);
  const newArTitle = ar.title ? rewriteAr(ar.title, r.ar) : null;

  // SEO updates: replace any occurrence of the old first word
  const newSeoTitle = (node.seo?.title || "").replaceAll(oldFirstEn, r.en);
  const newSeoDesc = (node.seo?.description || "").replaceAll(oldFirstEn, r.en);

  // AR meta replacements
  const newArMetaTitle = oldFirstAr ? (ar.meta_title || "").replaceAll(oldFirstAr, r.ar) : (ar.meta_title || "");
  const newArMetaDesc = oldFirstAr ? (ar.meta_description || "").replaceAll(oldFirstAr, r.ar) : (ar.meta_description || "");

  // Tags: rename any tag that exactly matches the old first word (lowercase)
  const newTags = (node.tags || []).map((tag) => {
    if (tag.toLowerCase() === oldFirstEn.toLowerCase()) return r.en.toLowerCase();
    if (oldFirstAr && tag === oldFirstAr) return r.ar;
    return tag;
  });
  const tagsChanged = JSON.stringify(newTags) !== JSON.stringify(node.tags || []);

  proposals.push({
    sku: r.sku, id: node.id,
    oldEnTitle: node.title, newEnTitle,
    oldArTitle: ar.title || "", newArTitle,
    oldSeoT: node.seo?.title || "", newSeoT: newSeoTitle,
    oldSeoD: node.seo?.description || "", newSeoD: newSeoDesc,
    oldArMetaT: ar.meta_title || "", newArMetaT: newArMetaTitle,
    oldArMetaD: ar.meta_description || "", newArMetaD: newArMetaDesc,
    oldFirstEn, oldFirstAr,
    enContent, arOriginal: ar,
    newTags, tagsChanged,
  });
}

// Print full proposal
console.log("\n" + "═".repeat(82));
console.log("RENAME PROPOSAL");
console.log("═".repeat(82));
for (const pr of proposals) {
  console.log(`\n${pr.sku}  (${pr.oldFirstEn} → ${bySku[pr.sku].en})`);
  console.log(`  EN: ${pr.oldEnTitle}`);
  console.log(`    → ${pr.newEnTitle}`);
  if (pr.oldArTitle) {
    console.log(`  AR: ${pr.oldArTitle}`);
    console.log(`    → ${pr.newArTitle}`);
  }
  if (pr.tagsChanged) {
    console.log(`  TAGS: ${pr.newTags.filter((_, i) => _ !== (proposals.find((x) => x.sku === pr.sku)?.newTags[i])).join(", ") || "renamed-tag"}`);
  }
}

// Sanity: verify no two products end up with same EN title or AR title
const enSet = new Map();
const arSet = new Map();
for (const pr of proposals) {
  enSet.set(pr.newEnTitle, (enSet.get(pr.newEnTitle) || 0) + 1);
  if (pr.newArTitle) arSet.set(pr.newArTitle, (arSet.get(pr.newArTitle) || 0) + 1);
}
let collisions = 0;
for (const [t, n] of enSet) if (n > 1) { console.warn(`⚠ EN COLLISION: "${t}" ×${n}`); collisions++; }
for (const [t, n] of arSet) if (n > 1) { console.warn(`⚠ AR COLLISION: "${t}" ×${n}`); collisions++; }

console.log("\n" + "═".repeat(82));
console.log(`Ready: ${proposals.length}  |  Collisions: ${collisions}`);
console.log("═".repeat(82));

if (!APPLY) {
  console.log("\nDry-run only. Re-run with --apply to write to Shopify.");
  process.exit(0);
}
if (collisions) {
  console.error("\nAborting: collisions detected. Fix the mapping first.");
  process.exit(1);
}

let applied = 0;
let errors = 0;
for (const pr of proposals) {
  const upd = await gql(
    `mutation($p: ProductInput!) {
      productUpdate(input: $p) {
        product { id }
        userErrors { field message }
      }
    }`,
    {
      p: {
        id: pr.id,
        title: pr.newEnTitle,
        seo: { title: pr.newSeoT, description: pr.newSeoD },
        tags: pr.newTags,
      },
    },
  );
  if (upd.productUpdate.userErrors.length) {
    console.log(`✗ ${pr.sku}: ${JSON.stringify(upd.productUpdate.userErrors)}`);
    errors++;
    continue;
  }
  // AR translations
  if (pr.newArTitle) {
    const arPayload = [];
    const push = (key, value) => {
      const c = pr.enContent[key];
      if (!c?.digest || !value) return;
      arPayload.push({ locale: "ar", key, value, translatableContentDigest: c.digest });
    };
    push("title", pr.newArTitle);
    if (pr.newArMetaT && pr.newArMetaT !== pr.oldArMetaT) push("meta_title", pr.newArMetaT);
    if (pr.newArMetaD && pr.newArMetaD !== pr.oldArMetaD) push("meta_description", pr.newArMetaD);
    if (arPayload.length) {
      const ar = await gql(
        `mutation($id: ID!, $t: [TranslationInput!]!) {
          translationsRegister(resourceId: $id, translations: $t) {
            translations { key }
            userErrors { field message }
          }
        }`,
        { id: pr.id, t: arPayload },
      );
      if (ar.translationsRegister.userErrors.length) {
        console.log(`✗ ${pr.sku} (AR): ${JSON.stringify(ar.translationsRegister.userErrors)}`);
        errors++;
        continue;
      }
    }
  }
  applied++;
  console.log(`✓ ${pr.sku} → ${pr.newEnTitle}`);
}

console.log(`\nApplied ${applied}  |  Errors ${errors}`);
