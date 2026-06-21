#!/usr/bin/env node
/**
 * Audit AR translation coverage on all Shopify collections.
 * For each collection, check whether title / body_html / meta_title / meta_description
 * have an AR translation registered.
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

const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query, variables) {
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

async function listAllCollections() {
  const out = [];
  let cursor = null;
  while (true) {
    const d = await gql(
      `query($cursor: String) {
        collections(first: 50, after: $cursor) {
          edges { cursor node { id handle title } }
          pageInfo { hasNextPage }
        }
      }`,
      { cursor },
    );
    for (const e of d.collections.edges) out.push(e.node);
    if (!d.collections.pageInfo.hasNextPage) break;
    cursor = d.collections.edges[d.collections.edges.length - 1].cursor;
    await sleep(200);
  }
  return out;
}

async function getArCoverage(id) {
  const d = await gql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key value }
        translations(locale: "ar") { key value }
      }
    }`,
    { id },
  );
  const sourceKeys = new Set(d.translatableResource.translatableContent.map((c) => c.key));
  const arKeys = new Set(d.translatableResource.translations.map((t) => t.key));
  const KEYS = ["title", "body_html", "meta_title", "meta_description"];
  const present = KEYS.filter((k) => arKeys.has(k));
  const missing = KEYS.filter((k) => !arKeys.has(k));
  const sourceMissing = KEYS.filter((k) => !sourceKeys.has(k));
  return { present, missing, sourceMissing };
}

const collections = await listAllCollections();
console.log(`Auditing ${collections.length} collections for AR translation coverage…\n`);

const rows = [];
for (const c of collections) {
  try {
    const cov = await getArCoverage(c.id);
    rows.push({ ...c, ...cov });
    await sleep(150);
  } catch (e) {
    rows.push({ ...c, error: e.message });
  }
}

const full = rows.filter((r) => !r.error && r.present.length === 4);
const partial = rows.filter((r) => !r.error && r.present.length > 0 && r.present.length < 4);
const empty = rows.filter((r) => !r.error && r.present.length === 0);
const errored = rows.filter((r) => r.error);

console.log(`✅ Full coverage (4/4): ${full.length}`);
for (const r of full) console.log(`   ${r.handle.padEnd(32)} — ${r.title}`);

console.log(`\n⚠️  Partial coverage: ${partial.length}`);
for (const r of partial) {
  console.log(`   ${r.handle.padEnd(32)} — ${r.title}`);
  console.log(`      have: ${r.present.join(", ") || "(none)"}`);
  console.log(`      missing: ${r.missing.join(", ")}`);
  if (r.sourceMissing.length) console.log(`      (source has no: ${r.sourceMissing.join(", ")})`);
}

console.log(`\n❌ No AR translations: ${empty.length}`);
for (const r of empty) {
  console.log(`   ${r.handle.padEnd(32)} — ${r.title}`);
  if (r.sourceMissing.length) console.log(`      (source has no: ${r.sourceMissing.join(", ")})`);
}

if (errored.length) {
  console.log(`\n💥 Errors: ${errored.length}`);
  for (const r of errored) console.log(`   ${r.handle} — ${r.error}`);
}

console.log(`\nTotal: ${rows.length} | Full 4/4: ${full.length} | Partial: ${partial.length} | None: ${empty.length}`);
