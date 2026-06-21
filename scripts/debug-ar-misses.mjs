#!/usr/bin/env node
// Find AR "في الكويت" occurrences where audit-occasion-AR matched but
// strip-script did NOT, so I can extend the AR regex.
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

async function gql(q, v = {}) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query: q, variables: v }),
  });
  return (await r.json()).data;
}

const AR_OCCASIONS = "(?:ال)?(?:تجمّعات|تجمعات|سهرات|أعراس|مناسبات|مناسبة|حفلات|ليالي|أمسيات|احتفالات|أعياد|سهرة|أمسية|حفلة|تجمع)";
const AR_ADJ = "(?:\\s+(?:ال)?(?:عائلية|الخاصة|خاصة|رسمية|الرسمية|الكبرى|العيد|الأعياد|الكبيرة|الصغيرة|الراقية|راقية|عائلية|أنيقة))*";
const AR_RE = new RegExp(`(${AR_OCCASIONS}${AR_ADJ})\\s+في\\s+الكويت`, "g");
const AR_PROVENANCE = /(أتيليه|صنع|صُنع|مصنوع|يُصنع|تُخاط|تخاط|من أتيليه|بلو مارين)/;

const Q = `query Products($cursor: String) {
  products(first: 50, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes { id handle translations(locale: "ar") { key value } }
  }
}`;

let cursor = null;
const misses = [];
while (true) {
  const data = await gql(Q, { cursor });
  for (const p of data.products.nodes) {
    const ar = (p.translations.find(t => t.key === "body_html") || {}).value || "";
    if (!ar) continue;
    let idx = 0;
    while ((idx = ar.indexOf("في الكويت", idx)) !== -1) {
      const window = ar.slice(Math.max(0, idx - 100), idx);
      // is it provenance?
      const isProv = AR_PROVENANCE.test(window);
      // does occasion-pattern match within ~80 chars before this in Kuwait?
      const localText = ar.slice(Math.max(0, idx - 100), idx + 12);
      AR_RE.lastIndex = 0;
      const m = AR_RE.exec(localText);
      const matched = m && (m.index + m[0].length === localText.indexOf("في الكويت") + "في الكويت".length);

      if (!isProv && !matched) {
        misses.push({
          handle: p.handle,
          ctx: ar.slice(Math.max(0, idx - 90), idx + 30).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
        });
      }
      idx += "في الكويت".length;
    }
  }
  if (!data.products.pageInfo.hasNextPage) break;
  cursor = data.products.pageInfo.endCursor;
}

console.log(`Misses (AR occasion not yet caught): ${misses.length}`);
for (const m of misses) {
  console.log(`  [${m.handle}] …${m.ctx}…`);
}
