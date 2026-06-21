#!/usr/bin/env node
/**
 * Audit every product for name consistency across:
 *   - Title (EN)
 *   - Body description HTML (EN)
 *   - SEO title + description (EN)
 *   - Handle
 *   - Featured image altText
 *   - AR title
 *   - AR body_html
 *   - AR meta_title + meta_description
 *
 * Catches issues like A69 where the title was renamed (Sahar → Hatoon)
 * but the body / SEO / image alt / handle still reference the old name.
 *
 * Output: name-consistency-audit.json + console summary.
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

const EN_GENERIC = new Set([
  "daraa", "caftan", "bisht", "set", "piece", "2-piece", "3-piece",
  "two-piece", "three-piece", "dress", "gown", "fragrance", "perfume",
  "oud", "the", "and", "of", "with", "collection", "a", "an", "for",
]);

const AR_GENERIC = new Set([
  "درّاعة", "دراعة", "قفطان", "بشت", "طقم", "ثوب", "قطعة", "قطعتين",
  "ثلاث", "قطع", "عطر", "ال", "و", "من", "في",
]);

function stripSkuPrefix(s) {
  if (!s) return "";
  return s.replace(/^A\d+\s*[–—\-]\s*/i, "").trim();
}

function tokenize(s) {
  if (!s) return [];
  return s.split(/[\s,،]+/).filter(Boolean);
}

function properNounsEn(title) {
  return tokenize(stripSkuPrefix(title))
    .filter((w) => !/^\d/.test(w))
    .filter((w) => !EN_GENERIC.has(w.toLowerCase()))
    .filter((w) => w.length >= 2);
}

function properNounsAr(title) {
  return tokenize(stripSkuPrefix(title))
    .filter((w) => !/^\d/.test(w))
    .filter((w) => !AR_GENERIC.has(w.replace(/[ًٌٍَُِّْـ]/g, "")))
    .filter((w) => w.length >= 2);
}

function stripHtml(html) {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function containsWord(text, word) {
  if (!text || !word) return false;
  const re = new RegExp(`(^|[^\\p{L}])${escapeRegex(word)}([^\\p{L}]|$)`, "iu");
  return re.test(text);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slugContains(handle, word) {
  if (!handle || !word) return false;
  const slug = handle.toLowerCase();
  return slug.includes(word.toLowerCase());
}

// Fetch all products
const products = [];
let cursor = null;
while (true) {
  const d = await gql(
    `query($c:String){
      products(first:50, after:$c) {
        pageInfo { hasNextPage endCursor }
        edges { node {
          id title handle status productType
          descriptionHtml
          seo { title description }
          featuredImage { altText }
          translations(locale:"ar") { key value }
        } }
      }
    }`,
    { c: cursor },
  );
  for (const e of d.products.edges) products.push(e.node);
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}

console.log(`Auditing ${products.length} products for name consistency...\n`);

const findings = [];

for (const p of products) {
  const enTokens = properNounsEn(p.title);
  if (enTokens.length === 0) continue; // generic / empty title

  const enBodyText = stripHtml(p.descriptionHtml);
  const seoTitle = p.seo?.title || "";
  const seoDesc = p.seo?.description || "";
  const alt = p.featuredImage?.altText || "";

  const arTitle = p.translations.find((t) => t.key === "title")?.value || "";
  const arBody = stripHtml(p.translations.find((t) => t.key === "body_html")?.value || "");
  const arMetaTitle = p.translations.find((t) => t.key === "meta_title")?.value || "";
  const arMetaDesc = p.translations.find((t) => t.key === "meta_description")?.value || "";

  const issues = [];

  for (const word of enTokens) {
    const checks = {
      body: containsWord(enBodyText, word),
      seoTitle: containsWord(seoTitle, word) || !seoTitle,
      seoDesc: containsWord(seoDesc, word) || !seoDesc,
      altText: containsWord(alt, word) || !alt,
      handle: slugContains(p.handle, word),
    };
    for (const [field, ok] of Object.entries(checks)) {
      if (!ok) {
        issues.push({ word, field, kind: "missing-name-token" });
      }
    }
  }

  // AR side
  if (arTitle) {
    const arTokens = properNounsAr(arTitle);
    for (const word of arTokens) {
      const checks = {
        arBody: arBody && containsWord(arBody, word),
        arMetaTitle: !arMetaTitle || containsWord(arMetaTitle, word),
        arMetaDesc: !arMetaDesc || containsWord(arMetaDesc, word),
      };
      for (const [field, ok] of Object.entries(checks)) {
        if (!ok) issues.push({ word, field, kind: "missing-ar-name-token" });
      }
    }
  } else {
    issues.push({ word: "(title)", field: "arTitle", kind: "missing-ar-translation" });
  }

  if (issues.length) {
    findings.push({
      sku: stripSkuPrefix(p.title).slice(0, 0) || p.title.match(/^A\d+/i)?.[0] || "",
      handle: p.handle,
      title: p.title,
      arTitle,
      enTokens,
      seoTitle,
      altText: alt,
      issues,
    });
  }
}

writeFileSync(
  resolve(__dirname, "..", "name-consistency-audit.json"),
  JSON.stringify({ scannedAt: new Date().toISOString(), totalProducts: products.length, totalFlagged: findings.length, findings }, null, 2),
);

console.log(`Scanned ${products.length} products | Flagged ${findings.length}\n`);

// Group issues by kind
const byKind = {};
for (const f of findings) {
  for (const i of f.issues) {
    byKind[i.kind] = (byKind[i.kind] || 0) + 1;
  }
}
console.log("Issue breakdown:");
for (const [k, n] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(28)} ${n}`);
}

console.log("\nTop 30 flagged products:");
for (const f of findings.slice(0, 30)) {
  console.log(`\n● ${f.title}`);
  console.log(`  handle: ${f.handle}`);
  console.log(`  alt:    ${f.altText}`);
  console.log(`  ar:     ${f.arTitle}`);
  for (const i of f.issues.slice(0, 6)) {
    console.log(`    [${i.kind}] "${i.word}" missing from ${i.field}`);
  }
  if (f.issues.length > 6) console.log(`    ... +${f.issues.length - 6} more`);
}

console.log("\nFull report: name-consistency-audit.json");
