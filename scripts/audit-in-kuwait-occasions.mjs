#!/usr/bin/env node
/**
 * Audit-only: find ALL mentions of "in Kuwait" (EN) and "في الكويت" (AR) in
 * product descriptions, classify them as occasion-phrase vs provenance, and
 * print snippets. Provenance ("Made-to-order in Kuwait", "atelier-made in
 * Kuwait", "Kuwait atelier") should be kept; occasion mentions should go.
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
const URL_ = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${process.env.SHOPIFY_API_VERSION || "2024-10"}/graphql.json`;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

const args = process.argv.slice(2);
const LIMIT = (() => {
  const i = args.indexOf("--limit");
  return i >= 0 ? Number(args[i + 1]) : Infinity;
})();

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

const PROVENANCE_EN = /(made(?:-|\s)to(?:-|\s)order in Kuwait|atelier(?:-|\s)made in Kuwait|made in Kuwait|Kuwait atelier|crafted in Kuwait|designed in Kuwait|tailored in Kuwait|sewn in Kuwait|stitched in Kuwait|hand(?:-|\s)?finished in Kuwait|hand(?:-|\s)?made in Kuwait)/i;
const PROVENANCE_AR = /(صنع في الكويت|صُنع في الكويت|أتيليه كويتي|في أتيليه كويتي|من أتيليه في الكويت|مصنوع في الكويت|تُخاط في الكويت|تخاط في الكويت)/;

const Q = `
  query Products($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        title
        descriptionHtml
        translations(locale: "ar") { key value }
      }
    }
  }
`;

function findAll(haystack, needle) {
  const out = [];
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    out.push(idx);
    idx += needle.length;
  }
  return out;
}

function snippet(text, idx, len, pad = 70) {
  const start = Math.max(0, idx - pad);
  const end = Math.min(text.length, idx + len + pad);
  return (start > 0 ? "…" : "") + text.slice(start, end).replace(/\s+/g, " ").trim() + (end < text.length ? "…" : "");
}

async function main() {
  let cursor = null;
  let seen = 0;
  const buckets = { occasionEn: [], provenanceEn: [], otherEn: [], occasionAr: [], provenanceAr: [], otherAr: [] };

  while (true) {
    const data = await gql(Q, { cursor });
    for (const p of data.products.nodes) {
      if (seen >= LIMIT) break;
      seen++;

      const enText = (p.descriptionHtml || "").replace(/<[^>]+>/g, " ");
      const arText = ((p.translations.find(t => t.key === "body_html") || {}).value || "").replace(/<[^>]+>/g, " ");

      for (const idx of findAll(enText, "in Kuwait")) {
        const ctx = snippet(enText, idx, "in Kuwait".length, 90);
        const aroundProvenance = enText.slice(Math.max(0, idx - 40), idx + "in Kuwait".length);
        const bucket = PROVENANCE_EN.test(aroundProvenance) ? buckets.provenanceEn :
                       /\b(gatherings?|evenings?|weddings?|events?|occasions?|dinners?|receptions?|nights?|celebrations?|parties|festivities|festivals?|reunions?)\b[^.]{0,60}in Kuwait/i.test(enText.slice(Math.max(0, idx - 200), idx + 10)) ? buckets.occasionEn :
                       buckets.otherEn;
        bucket.push({ handle: p.handle, snip: ctx });
      }

      for (const idx of findAll(arText, "في الكويت")) {
        const ctx = snippet(arText, idx, "في الكويت".length, 90);
        const aroundProvenance = arText.slice(Math.max(0, idx - 60), idx + "في الكويت".length);
        const bucket = PROVENANCE_AR.test(aroundProvenance) ? buckets.provenanceAr :
                       /(تجمعات|تجمّعات|سهرات|أعراس|مناسبات|حفلات|ليالي|أمسيات|أعياد|احتفالات|الأعراس|السهرات|التجمعات|المناسبات|الحفلات|الليالي|الأمسيات)/.test(arText.slice(Math.max(0, idx - 200), idx + 10)) ? buckets.occasionAr :
                       buckets.otherAr;
        bucket.push({ handle: p.handle, snip: ctx });
      }
    }
    if (seen >= LIMIT || !data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }

  console.log(`Scanned ${seen} products`);
  console.log("");
  console.log("=== EN ===");
  console.log(`  occasion → strip:  ${buckets.occasionEn.length}`);
  console.log(`  provenance → keep: ${buckets.provenanceEn.length}`);
  console.log(`  other → review:    ${buckets.otherEn.length}`);
  console.log("");
  console.log("=== AR ===");
  console.log(`  occasion → strip:  ${buckets.occasionAr.length}`);
  console.log(`  provenance → keep: ${buckets.provenanceAr.length}`);
  console.log(`  other → review:    ${buckets.otherAr.length}`);
  console.log("");

  for (const [name, list] of Object.entries(buckets)) {
    if (!list.length) continue;
    console.log(`--- ${name} (${list.length}, showing up to 5) ---`);
    for (const e of list.slice(0, 5)) {
      console.log(`  [${e.handle}] ${e.snip}`);
    }
    console.log("");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
