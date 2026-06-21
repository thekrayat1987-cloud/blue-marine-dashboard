#!/usr/bin/env node
/**
 * For every product flagged as CRITICAL by audit-name-consistency.mjs,
 * detect the OLD person name (from alt text / handle) and replace it with
 * the NEW person name (from the title) across:
 *   - descriptionHtml (EN)
 *   - AR body_html
 *   - featured image altText (+ all media)
 *   - product handle (Shopify auto-creates 301 redirect)
 *
 * Skips products with no detectable person-name swap (pure-descriptive
 * titles like "A30 – Black and Brown Velvet Overcoat 2-Piece Set").
 *
 * Usage:
 *   node scripts/batch-rename-stale-fields.mjs           # dry-run
 *   node scripts/batch-rename-stale-fields.mjs --apply
 *   node scripts/batch-rename-stale-fields.mjs --limit 5 --apply
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
const APPLY = process.argv.includes("--apply");
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  return i >= 0 ? Number(process.argv[i + 1]) : Infinity;
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Known OLD template names → AR equivalents.
// (Only EN→AR mappings for OLD names. NEW names come from the AR title.)
const OLD_NAMES_EN_TO_AR = {
  Sahar: "سحر",
  Amira: "أميرة",
  Yaqut: "ياقوت",
  Zumurud: "زمرد",
  Bahar: "بهار",
  Lulu: "لؤلؤ",
  "Lu'lu": "لؤلؤ",
  Diya: "ضياء",
  Asala: "أصالة",
};

// Generic words that look capitalized but aren't person names.
const NOT_A_PERSON = new Set([
  "Bisht", "Daraa", "Caftan", "Set", "Piece", "Velvet", "Black", "White",
  "Red", "Blue", "Green", "Navy", "Emerald", "Burgundy", "Crimson",
  "Autumn", "Dawn", "Brown", "Gold", "Silver", "Bronze", "Olive",
  "Plum", "Ivory", "Beige", "Cream", "Mustard", "Yellow", "Orange", "Pink",
  "Purple", "Sold", "Out", "Two", "Three", "One", "Leaves",
  "Floral", "Geometric", "Striped", "Printed", "Mosaic", "Royal",
  "Patchwork", "Multi", "Multi-Color", "Eau", "de", "Parfum", "Atelier",
  "Marine", "Blue",
]);

const AR_GENERIC = new Set([
  "درّاعة", "دراعة", "قفطان", "بشت", "طقم", "ثوب", "قطعة", "قطعتين",
  "قطع", "عطر", "ال", "و", "من", "في", "مع",
  "مخمل", "مخملي", "أسود", "أبيض", "أحمر", "أزرق", "أخضر", "كحلي",
  "بني", "ذهبي", "عنابي", "بنفسجي", "كريمي", "عاجي",
]);

function stripSkuPrefix(s) {
  return (s || "").replace(/^A\d+\s*[–—\-]\s*/i, "").trim();
}

function tokenizeEn(s) {
  return (s || "")
    .replace(/SOLD\s+OUT/gi, "")
    .replace(/^A\d+\s*[–—\-]\s*/i, "")
    .match(/\b[A-Z][A-Za-z']+\b/g) || [];
}

function detectNewEnName(title) {
  for (const t of tokenizeEn(title)) {
    if (!NOT_A_PERSON.has(t)) return t;
  }
  return null;
}

function detectOldEnName(alt, newName) {
  for (const t of tokenizeEn(alt)) {
    if (NOT_A_PERSON.has(t)) continue;
    if (newName && t.toLowerCase() === newName.toLowerCase()) continue;
    if (OLD_NAMES_EN_TO_AR[t]) return t;
    // Also accept any non-generic capitalized word as old name
    return t;
  }
  return null;
}

function tokenizeAr(s) {
  return (s || "")
    .replace(/^A\d+\s*[–—\-]\s*/i, "")
    .split(/[\s،.,!?؟]+/)
    .map((w) => w.replace(/[ًٌٍَُِّْـ]/g, ""))
    .filter((w) => w && /^[؀-ۿ']+$/.test(w))
    .filter((w) => !AR_GENERIC.has(w));
}

function detectNewArName(arTitle) {
  const toks = tokenizeAr(arTitle);
  return toks[0] || null;
}

function slugifyTitle(title) {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[–—'']/g, "-")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// --- Load audit ---
const audit = JSON.parse(readFileSync(resolve(__dirname, "..", "name-consistency-audit-tiered.json"), "utf8"));
const critical = audit.byTier.CRITICAL;
console.log(`Loaded ${critical.length} CRITICAL products from audit.\n`);

// --- Plan changes ---
const plans = [];
const skipped = [];

for (const f of critical) {
  const newEn = detectNewEnName(f.title);
  const oldEn = detectOldEnName(f.altText, newEn);
  if (!newEn) {
    skipped.push({ handle: f.handle, title: f.title, reason: "no person-name in title" });
    continue;
  }
  if (!oldEn) {
    skipped.push({ handle: f.handle, title: f.title, reason: "no detectable old name in alt" });
    continue;
  }
  if (oldEn.toLowerCase() === newEn.toLowerCase()) {
    skipped.push({ handle: f.handle, title: f.title, reason: "old == new (false flag)" });
    continue;
  }
  const newAr = detectNewArName(f.arTitle);
  const oldAr = OLD_NAMES_EN_TO_AR[oldEn] || null;
  const newHandle = slugifyTitle(f.title);
  plans.push({
    productGid: null, // resolved below
    handle: f.handle,
    title: f.title,
    arTitle: f.arTitle,
    altText: f.altText,
    newEn,
    oldEn,
    newAr,
    oldAr,
    newHandle,
  });
}

console.log(`Plans: ${plans.length}  |  Skipped: ${skipped.length}\n`);

console.log("=== Skipped products ===");
for (const s of skipped) console.log(`  ${s.handle} — ${s.reason}`);
console.log();

console.log("=== Planned replacements (first 30) ===");
for (const p of plans.slice(0, 30)) {
  console.log(`\n● ${p.title}`);
  console.log(`  handle:  ${p.handle}  →  ${p.newHandle}`);
  console.log(`  EN:      ${p.oldEn}  →  ${p.newEn}`);
  console.log(`  AR:      ${p.oldAr || "(no AR map for " + p.oldEn + ")"}  →  ${p.newAr || "(no AR new name)"}`);
}
if (plans.length > 30) console.log(`\n  ... +${plans.length - 30} more`);

// --- Save plan ---
writeFileSync(
  resolve(__dirname, "..", "batch-rename-plan.json"),
  JSON.stringify({ plans, skipped }, null, 2),
);
console.log("\nFull plan saved: batch-rename-plan.json");

if (!APPLY) {
  console.log(`\n[DRY RUN] ${plans.length} products would be updated. Re-run with --apply to push.`);
  process.exit(0);
}

// --- Resolve product GIDs by handle, then apply ---
console.log("\n=== APPLYING ===\n");

const PRODUCT_BY_HANDLE = `query($handle:String!){
  productByHandle(handle:$handle){
    id descriptionHtml
    featuredImage { altText }
    media(first: 50) { edges { node { id ... on MediaImage { image { altText } } } } }
    translations(locale:"ar") { key value }
    translatableResource: __typename
  }
  res: translatableResource(resourceId: "") { translatableContent { key digest } }
}`;
// Note: above query has a hack — translatableResource needs an id. We'll do it as a separate call.

async function getProductByHandle(handle) {
  const d = await gql(
    `query($h:String!){
      productByHandle(handle:$h){
        id descriptionHtml handle
        featuredImage { altText }
        media(first: 50) { edges { node { id ... on MediaImage { image { altText } } } } }
        translations(locale:"ar") { key value }
      }
    }`,
    { h: handle },
  );
  return d.productByHandle;
}

async function getDigests(id) {
  const d = await gql(
    `query($id:ID!){
      translatableResource(resourceId:$id){
        translatableContent { key digest }
      }
    }`,
    { id },
  );
  return Object.fromEntries((d.translatableResource?.translatableContent || []).map((c) => [c.key, c.digest]));
}

const log = [];
let ok = 0, fail = 0;
const slice = plans.slice(0, LIMIT);

for (const p of slice) {
  try {
    const prod = await getProductByHandle(p.handle);
    if (!prod) throw new Error("product not found by handle");

    // 1. New EN description (replace oldEn → newEn, case-insensitive, word boundary)
    const enRe = new RegExp(`\\b${escapeRegex(p.oldEn)}\\b`, "g");
    const newEnHtml = (prod.descriptionHtml || "").replace(enRe, p.newEn);

    // 2. New AR body (only if oldAr known and present)
    let newArHtml = null;
    const arBody = prod.translations.find((t) => t.key === "body_html")?.value || "";
    if (p.oldAr && p.newAr && arBody.includes(p.oldAr)) {
      newArHtml = arBody.split(p.oldAr).join(p.newAr);
    }

    // 3. Update product fields (descriptionHtml + handle)
    const updates = { id: prod.id };
    if (newEnHtml !== prod.descriptionHtml) updates.descriptionHtml = newEnHtml;
    if (p.newHandle && p.newHandle !== prod.handle) updates.handle = p.newHandle;

    if (updates.descriptionHtml || updates.handle) {
      const r = await gql(
        `mutation($p:ProductInput!){
          productUpdate(input:$p){ product{ id handle } userErrors{ field message } }
        }`,
        { p: updates },
      );
      if (r.productUpdate.userErrors.length) throw new Error("productUpdate: " + JSON.stringify(r.productUpdate.userErrors));
    }

    // 4. Update media altText for any media whose alt contains oldEn
    const mediaToFix = (prod.media?.edges || [])
      .filter((e) => e.node?.image?.altText && enRe.test(e.node.image.altText))
      .map((e) => ({ id: e.node.id, alt: e.node.image.altText.replace(enRe, p.newEn) }));
    if (mediaToFix.length) {
      const r = await gql(
        `mutation($files:[FileUpdateInput!]!){
          fileUpdate(files:$files){
            files{ alt }
            userErrors{ field message }
          }
        }`,
        { files: mediaToFix.map((m) => ({ id: m.id, alt: m.alt })) },
      );
      if (r.fileUpdate.userErrors.length) throw new Error("fileUpdate: " + JSON.stringify(r.fileUpdate.userErrors));
    }

    // 5. AR body translation (fresh digest after productUpdate)
    if (newArHtml && newArHtml !== arBody) {
      const digests = await getDigests(prod.id);
      const d = digests["body_html"];
      if (d) {
        const r = await gql(
          `mutation($id:ID!, $t:[TranslationInput!]!){
            translationsRegister(resourceId:$id, translations:$t){
              translations{ key } userErrors{ field message }
            }
          }`,
          { id: prod.id, t: [{ locale: "ar", key: "body_html", value: newArHtml, translatableContentDigest: d }] },
        );
        if (r.translationsRegister.userErrors.length) throw new Error("translationsRegister: " + JSON.stringify(r.translationsRegister.userErrors));
      }
    }

    ok++;
    log.push({ handle: p.handle, newHandle: p.newHandle, oldEn: p.oldEn, newEn: p.newEn, oldAr: p.oldAr, newAr: p.newAr, ok: true, mediaFixed: mediaToFix.length });
    console.log(`✓ ${p.handle} → ${p.newHandle}  (${p.oldEn}→${p.newEn}, media ${mediaToFix.length})`);
  } catch (err) {
    fail++;
    log.push({ handle: p.handle, ok: false, error: String(err) });
    console.log(`✗ ${p.handle}: ${err.message || err}`);
  }
  await sleep(350);
}

writeFileSync(resolve(__dirname, "..", "batch-rename-stale-fields.log.json"), JSON.stringify(log, null, 2));
console.log(`\n✓ ${ok}  ✗ ${fail}  |  Log: batch-rename-stale-fields.log.json`);
