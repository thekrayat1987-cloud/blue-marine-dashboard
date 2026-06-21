#!/usr/bin/env node
/**
 * Rollback the 29 products where batch-rename-stale-fields.mjs wrongly
 * treated a generic descriptor (Khaleeji, Patterned, Chiffon, Layered,
 * Bell, Rose, Trim, Golden, Fuchsia, Organza, Evening) as an old person
 * name.
 *
 * For each:
 *   - EN body: revert only specific "{newName} woman/sleeve/fabric/gown/
 *     piece/garment" phrase patterns back to "{oldGeneric} ..."
 *   - All media altText: blanket replace newName → oldGeneric (alt text
 *     was already template-generated, reverting can't break it worse)
 *
 * Does NOT touch handle (handle changes were correct) or AR body (the
 * batch script didn't touch AR body for these — generic words had no
 * AR mapping in OLD_NAMES_EN_TO_AR).
 *
 * Usage:
 *   node scripts/rollback-bogus-renames.mjs           # dry-run
 *   node scripts/rollback-bogus-renames.mjs --apply
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

// handle → { newName (wrongly inserted), oldGeneric (should be restored) }
const ROLLBACKS = [
  { handle: "a98-zumurud-3-piece-daraa-set", new: "Zumurud", old: "Khaleeji" },
  { handle: "a102-mona-daraa", new: "Mona", old: "Khaleeji" },
  { handle: "a103-latifa-daraa", new: "Latifa", old: "Khaleeji" },
  { handle: "a104-shaikha-daraa", new: "Shaikha", old: "Khaleeji" },
  { handle: "a105-anoud-daraa", new: "Anoud", old: "Khaleeji" },
  { handle: "a108-maitha-dawn-daraa", new: "Maitha", old: "Khaleeji" },
  { handle: "a112-sahar-floral-daraa", new: "Sahar", old: "Khaleeji" },
  { handle: "a117-mubarakiya-layered-bisht-daraa-set", new: "Mubarakiya", old: "Layered" },
  { handle: "a118-dana-bisht-daraa-set", new: "Dana", old: "Khaleeji" },
  { handle: "a119-munira-bisht-daraa-set", new: "Munira", old: "Khaleeji" },
  { handle: "a120-lu-lu-bisht-daraa-set", new: "Lu'lu", old: "Khaleeji" },
  { handle: "a121-anqa-bisht-daraa-set", new: "Anqa", old: "Layered" },
  { handle: "a131-farah-patterned-daraa", new: "Farah", old: "Patterned" },
  { handle: "a132-hawa-daraa", new: "Hawa", old: "Patterned" },
  { handle: "a133-desert-rose-daraa", new: "Desert", old: "Rose" },
  { handle: "a134-najma-daraa", new: "Najma", old: "Patterned" },
  { handle: "a147-maha-daraa", new: "Maha", old: "Bell" },
  { handle: "a148-tareefa-daraa", new: "Tareefa", old: "Chiffon" },
  { handle: "a149-bayan-daraa", new: "Bayan", old: "Chiffon" },
  { handle: "a150-lina-daraa", new: "Lina", old: "Fuchsia" },
  { handle: "a151-yara-daraa", new: "Yara", old: "Chiffon" },
  { handle: "a152-zhaira-daraa", new: "Zhaira", old: "Chiffon" },
  { handle: "a153-rahaf-daraa", new: "Rahaf", old: "Chiffon" },
  { handle: "a154-hana-daraa", new: "Hana", old: "Organza" },
  { handle: "a157-anwar-daraa-3-piece-set", new: "Anwar", old: "Layered" },
  { handle: "a158-najla-layered-daraa-3-piece-set", new: "Najla", old: "Layered" },
  { handle: "a159-lamya-daraa-2-piece-set", new: "Lamya", old: "Trim" },
  { handle: "a160-wafa-daraa-2-piece-set", new: "Wafa", old: "Golden" },
  { handle: "c95-amara-evening-dress", new: "Amara", old: "Evening" },
];

// Phrase patterns to revert in EN body (preserve legit uses of newName elsewhere).
// Example: "Latifa woman" → "Khaleeji woman" but leave "The Latifa Daraa..." alone.
const BODY_PHRASE_NOUNS = ["woman", "women", "girl", "girls", "bride", "fabric", "gown", "garment", "sleeve", "sleeves", "piece", "fashion", "style"];

console.log(`Will rollback ${ROLLBACKS.length} products.\n`);

const previews = [];

for (const rb of ROLLBACKS) {
  const d = await gql(
    `query($h:String!){
      productByHandle(handle:$h){
        id handle title descriptionHtml
        media(first: 50) { edges { node { id ... on MediaImage { image { altText } } } } }
      }
    }`,
    { h: rb.handle },
  );
  const p = d.productByHandle;
  if (!p) {
    console.log(`! ${rb.handle} NOT FOUND`);
    continue;
  }

  // EN body: only revert specific phrase patterns
  const newEsc = escapeRegex(rb.new);
  const phraseRe = new RegExp(`\\b${newEsc}(\\s+)(${BODY_PHRASE_NOUNS.join("|")})\\b`, "g");
  const newBody = (p.descriptionHtml || "").replace(phraseRe, `${rb.old}$1$2`);
  const bodyChanged = newBody !== p.descriptionHtml;

  // Alt text: set to product title (cleaner than reverting to old template junk)
  const cleanAlt = p.title;
  const mediaToFix = (p.media?.edges || [])
    .filter((e) => e.node?.image?.altText && e.node.image.altText !== cleanAlt)
    .map((e) => ({ id: e.node.id, alt: cleanAlt }));

  previews.push({ ...rb, id: p.id, title: p.title, bodyChanged, mediaToFix });

  console.log(`● ${rb.handle}`);
  console.log(`  body: ${bodyChanged ? "REVERT " + (p.descriptionHtml.match(phraseRe)?.length || 0) + " phrase(s)" : "no change"}`);
  console.log(`  alt:  ${mediaToFix.length} media → set to "${cleanAlt}"`);
}

if (!APPLY) {
  console.log("\n[DRY RUN] Re-run with --apply to push rollback.");
  process.exit(0);
}

console.log("\n=== APPLYING ROLLBACK ===\n");
let ok = 0, fail = 0;
const log = [];
for (const r of previews) {
  try {
    if (r.bodyChanged) {
      const newEsc = escapeRegex(r.new);
      const phraseRe = new RegExp(`\\b${newEsc}(\\s+)(${BODY_PHRASE_NOUNS.join("|")})\\b`, "g");
      const prod = await gql(`query($id:ID!){product(id:$id){descriptionHtml}}`, { id: r.id });
      const fresh = prod.product.descriptionHtml;
      const reverted = fresh.replace(phraseRe, `${r.old}$1$2`);
      const u = await gql(`mutation($p:ProductInput!){productUpdate(input:$p){product{id} userErrors{field message}}}`, { p: { id: r.id, descriptionHtml: reverted } });
      if (u.productUpdate.userErrors.length) throw new Error("body: " + JSON.stringify(u.productUpdate.userErrors));
    }
    if (r.mediaToFix.length) {
      const u = await gql(`mutation($files:[FileUpdateInput!]!){fileUpdate(files:$files){files{alt} userErrors{field message}}}`, { files: r.mediaToFix.map((m) => ({ id: m.id, alt: m.alt })) });
      if (u.fileUpdate.userErrors.length) throw new Error("alt: " + JSON.stringify(u.fileUpdate.userErrors));
    }
    ok++;
    log.push({ ...r, ok: true });
    console.log(`✓ ${r.handle}`);
  } catch (err) {
    fail++;
    log.push({ ...r, ok: false, error: String(err) });
    console.log(`✗ ${r.handle}: ${err.message || err}`);
  }
  await sleep(350);
}
writeFileSync(resolve(__dirname, "..", "rollback-bogus-renames.log.json"), JSON.stringify(log, null, 2));
console.log(`\n✓ ${ok}  ✗ ${fail}  |  Log: rollback-bogus-renames.log.json`);
