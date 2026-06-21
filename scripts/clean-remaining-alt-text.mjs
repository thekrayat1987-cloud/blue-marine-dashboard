#!/usr/bin/env node
/**
 * Final cleanup: set alt text = product title for the 10 products with
 * template-generated junk alt ("Daraa X – Patterned Yellow, Atelier Blue
 * Marine — Atelier Blue Marine" style).
 *
 * Skips:
 *   - blue-marine-eau-de-parfum-50ml (alt is informative, leave it)
 *   - c95-amara-evening-dress (already matches title)
 *
 * Usage:
 *   node scripts/clean-remaining-alt-text.mjs          # dry-run
 *   node scripts/clean-remaining-alt-text.mjs --apply
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

const HANDLES = [
  "a64-diya-printed-daraa",
  "a123-zafira-mosaic-daraa",
  "a124-noor-daraa",
  "a136-mosaic-bisht-3-piece-set",
  "a141-shams-daraa-2-piece-set",
  "a142-marjan-daraa-2-piece-set",
  "a143-loulwa-daraa-2-piece-set",
  "a144-lujain-bisht-set",
  "a145-banan-bisht-set",
  "a146-aroob-bisht-set",
];

const previews = [];
for (const h of HANDLES) {
  const d = await gql(
    `query($h:String!){
      productByHandle(handle:$h){
        id handle title
        media(first:50){ edges { node { id ... on MediaImage { image { altText } } } } }
      }
    }`,
    { h },
  );
  const p = d.productByHandle;
  if (!p) {
    console.log(`! ${h} NOT FOUND`);
    continue;
  }
  const cleanAlt = p.title;
  const mediaToFix = (p.media?.edges || [])
    .filter((e) => e.node?.image?.altText && e.node.image.altText !== cleanAlt)
    .map((e) => ({ id: e.node.id, alt: cleanAlt, oldAlt: e.node.image.altText }));
  previews.push({ handle: h, id: p.id, title: p.title, mediaToFix });
  console.log(`● ${h}`);
  console.log(`  title:   ${p.title}`);
  console.log(`  media:   ${mediaToFix.length} to update`);
  for (const m of mediaToFix.slice(0, 1)) {
    console.log(`    before: ${m.oldAlt}`);
    console.log(`    after:  ${m.alt}`);
  }
}

if (!APPLY) {
  console.log("\n[DRY RUN] Re-run with --apply to push.");
  process.exit(0);
}

console.log("\n=== APPLYING ===\n");
let ok = 0, fail = 0;
const log = [];
for (const r of previews) {
  try {
    if (r.mediaToFix.length) {
      const u = await gql(
        `mutation($files:[FileUpdateInput!]!){
          fileUpdate(files:$files){ files{ alt } userErrors{ field message } }
        }`,
        { files: r.mediaToFix.map((m) => ({ id: m.id, alt: m.alt })) },
      );
      if (u.fileUpdate.userErrors.length) throw new Error(JSON.stringify(u.fileUpdate.userErrors));
    }
    ok++;
    log.push({ handle: r.handle, ok: true, fixed: r.mediaToFix.length });
    console.log(`✓ ${r.handle} (${r.mediaToFix.length} media)`);
  } catch (err) {
    fail++;
    log.push({ handle: r.handle, ok: false, error: String(err) });
    console.log(`✗ ${r.handle}: ${err.message || err}`);
  }
  await sleep(350);
}
writeFileSync(resolve(__dirname, "..", "clean-remaining-alt-text.log.json"), JSON.stringify(log, null, 2));
console.log(`\n✓ ${ok}  ✗ ${fail}`);
