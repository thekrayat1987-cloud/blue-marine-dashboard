#!/usr/bin/env node
/**
 * Audit product descriptions (EN + AR) against Google Merchant Center rules.
 * Source: https://support.google.com/merchants/answer/7052112
 *
 * Flagged patterns:
 *  - Promotional language: free shipping, free delivery, sale, limited time, etc.
 *  - ALL CAPS lines (excluding short acronyms)
 *  - Over 5000 chars
 *  - Links / URLs / store self-references
 *  - Cross-product references ("see also", "matches with", "shop the collection")
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
const URL_ = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

async function gql(query, variables = {}) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const PRODUCTS_Q = `query Products($cursor: String) {
  products(first: 50, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    edges { node {
      id
      title
      handle
      status
      descriptionHtml
    } }
  }
}`;

const TRANSLATIONS_Q = `query($after: String) {
  translatableResources(resourceType: PRODUCT, first: 50, after: $after) {
    edges { node {
      resourceId
      translations(locale: "ar") { key value }
    } }
    pageInfo { hasNextPage endCursor }
  }
}`;

// Promotional / forbidden patterns
const EN_PROMO = [
  /\bfree\s+shipping\b/i,
  /\bfree\s+delivery\b/i,
  /\bfree\s+returns?\b/i,
  /\bbest\s+price\b/i,
  /\blowest\s+price\b/i,
  /\blimited\s+(time|offer|edition)\b/i,
  /\bsale\b/i,
  /\b\d{1,3}\s*%\s*off\b/i,
  /\bdiscount(ed)?\b/i,
  /\bbuy\s+now\b/i,
  /\bshop\s+now\b/i,
  /\border\s+now\b/i,
  /\bclick\s+here\b/i,
  /\bdon'?t\s+miss\b/i,
  /\bhurry\b/i,
  /\bact\s+(now|fast)\b/i,
  /\bspecial\s+offer\b/i,
  /\bexclusive\s+offer\b/i,
  /\bcheck\s+out\s+(our|the)\b/i,
  /\bvisit\s+(our|us)\b/i,
  /\bsee\s+(also|more|our)\b/i,
  /\bshop\s+the\s+collection\b/i,
  /\bmatches?\s+with\b/i,
  /\bpairs?\s+with\b/i,
];
const AR_PROMO = [
  /شحن\s*مجاني/,
  /توصيل\s*مجاني/,
  /إرجاع\s*مجاني/,
  /أفضل\s*سعر/,
  /أقل\s*سعر/,
  /لفترة\s*محدودة/,
  /عرض\s*محدود/,
  /إصدار\s*محدود/,
  /تخفيض/,
  /خصم/,
  /\bتنزيلات/,
  /اشتري\s*الآن/,
  /اطلب\s*الآن/,
  /تسوّق\s*الآن/,
  /تسوق\s*الآن/,
  /اضغط\s*هنا/,
  /لا\s*تفوّت/,
  /لا\s*تفوت/,
  /أسرع/,
  /عرض\s*خاص/,
  /عرض\s*حصري/,
  /زر\s*موقعنا/,
  /تفقّد/,
  /شاهد\s*أيضاً/,
  /تسوّق\s*المجموعة/,
];
const URL_RE = /https?:\/\/|www\.|bluemarine|atelier-blue/i;

function stripHtml(html) {
  return (html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectAllCaps(text) {
  // Look for runs of 4+ all-caps letters (allow A-Z plus spaces, ignore short acronyms like SKU/GCC/UAE)
  const lines = text.split(/[\n\r.!?]+/);
  const hits = [];
  for (const ln of lines) {
    const trimmed = ln.trim();
    if (trimmed.length < 8) continue;
    const letters = trimmed.replace(/[^A-Za-z]/g, "");
    if (letters.length < 8) continue;
    const upper = letters.replace(/[^A-Z]/g, "");
    if (upper.length / letters.length >= 0.85) {
      hits.push(trimmed.slice(0, 80));
    }
  }
  return hits;
}

function auditDescription(html, locale /* 'en' | 'ar' */) {
  const text = stripHtml(html);
  const issues = [];
  if (!text) return { text: "", length: 0, issues: ["empty"] };

  if (text.length > 5000) issues.push(`over_5000_chars (${text.length})`);

  const promoList = locale === "ar" ? AR_PROMO : EN_PROMO;
  for (const re of promoList) {
    const m = text.match(re);
    if (m) issues.push(`promo: "${m[0]}"`);
  }

  if (URL_RE.test(text)) {
    const m = text.match(URL_RE);
    issues.push(`link/self-ref: "${m[0]}"`);
  }

  if (locale === "en") {
    const caps = detectAllCaps(text);
    for (const c of caps) issues.push(`all_caps: "${c}"`);
  }

  return { text, length: text.length, issues };
}

// ---- Fetch products
const products = [];
let cursor = null;
let page = 0;
while (true) {
  page++;
  const data = await gql(PRODUCTS_Q, { cursor });
  for (const e of data.products.edges) products.push(e.node);
  process.stderr.write(`fetched products page ${page} (${products.length})\n`);
  if (!data.products.pageInfo.hasNextPage) break;
  cursor = data.products.pageInfo.endCursor;
}

// ---- Fetch AR translations
const arByGid = new Map();
let after = null;
let tPage = 0;
while (true) {
  tPage++;
  const data = await gql(TRANSLATIONS_Q, { after });
  for (const e of data.translatableResources.edges) {
    const tr = (e.node.translations || []).find((t) => t.key === "body_html");
    if (tr) arByGid.set(e.node.resourceId, tr.value);
  }
  process.stderr.write(`fetched translations page ${tPage}\n`);
  if (!data.translatableResources.pageInfo.hasNextPage) break;
  after = data.translatableResources.pageInfo.endCursor;
}

// ---- Audit
const violations = [];
const counts = {
  total: products.length,
  en_clean: 0,
  en_violations: 0,
  ar_clean: 0,
  ar_violations: 0,
  ar_missing: 0,
};
const issueTallies = {};

for (const p of products) {
  if (p.status !== "ACTIVE") continue;
  const en = auditDescription(p.descriptionHtml, "en");
  const arHtml = arByGid.get(p.id);
  const ar = arHtml ? auditDescription(arHtml, "ar") : null;

  if (en.issues.length) counts.en_violations++;
  else counts.en_clean++;
  if (!arHtml) counts.ar_missing++;
  else if (ar.issues.length) counts.ar_violations++;
  else counts.ar_clean++;

  for (const i of en.issues) {
    const key = "EN " + i.split(":")[0].split("(")[0].trim();
    issueTallies[key] = (issueTallies[key] || 0) + 1;
  }
  if (ar) {
    for (const i of ar.issues) {
      const key = "AR " + i.split(":")[0].split("(")[0].trim();
      issueTallies[key] = (issueTallies[key] || 0) + 1;
    }
  }

  if (en.issues.length || (ar && ar.issues.length)) {
    violations.push({
      handle: p.handle,
      title: p.title,
      en_length: en.length,
      en_issues: en.issues,
      ar_length: ar?.length ?? null,
      ar_issues: ar?.issues ?? null,
    });
  }
}

const report = {
  generated_at: new Date().toISOString(),
  counts,
  issue_tallies: issueTallies,
  violations,
};

writeFileSync(resolve(__dirname, "..", "gmc-description-compliance.json"), JSON.stringify(report, null, 2));

// Console summary
console.log("\n=== GMC Description Compliance ===");
console.log(`Active products audited: ${counts.total}`);
console.log(`EN clean:       ${counts.en_clean}`);
console.log(`EN violations:  ${counts.en_violations}`);
console.log(`AR missing:     ${counts.ar_missing}`);
console.log(`AR clean:       ${counts.ar_clean}`);
console.log(`AR violations:  ${counts.ar_violations}`);
console.log("\nTop issue types:");
const sorted = Object.entries(issueTallies).sort((a, b) => b[1] - a[1]);
for (const [k, v] of sorted) console.log(`  ${v.toString().padStart(4)} × ${k}`);
console.log(`\nFull report → dashboard/gmc-description-compliance.json (${violations.length} products flagged)`);
