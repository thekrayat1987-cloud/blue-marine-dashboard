#!/usr/bin/env node
/**
 * For every ARCHIVED product, create a 301 redirect from its dead URL
 * to the most relevant collection, based on productType.
 * Preserves SEO juice and rescues users who land on a dead bookmark/share.
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

function pickTarget(productType, handle) {
  const t = (productType || "").toLowerCase();
  if (t === "bisht set" && handle.includes("3-piece") || t === "three-piece daraa") return "/collections/3-piece-daraa-set";
  if (t === "bisht set" && handle.includes("2-piece") || t === "two-piece daraa") return "/collections/2-piece-set-daraa";
  if (t === "bisht set" || t === "bisht") return "/collections/3-piece-daraa-set";
  if (t === "caftan") return "/collections/one-piece-daraa";
  if (t === "fragrance") return "/collections/eau-de-parfum";
  return "/collections/one-piece-daraa";
}

const archived = [];
let after = null;
while (true) {
  const d = await gql(
    `query($after:String){
      products(first:50, after:$after, query:"status:archived"){
        edges{ node{ id handle title productType } }
        pageInfo{ hasNextPage endCursor }
      }
    }`,
    { after },
  );
  for (const e of d.products.edges) archived.push(e.node);
  if (!d.products.pageInfo.hasNextPage) break;
  after = d.products.pageInfo.endCursor;
  await sleep(120);
}

console.log(`\n=== ${archived.length} produits archivés ===\n`);

const log = [];
let created = 0, skipped = 0;
for (const p of archived) {
  const path = `/products/${p.handle}`;
  const target = pickTarget(p.productType, p.handle);
  // Check if redirect already exists for this path
  const existing = await gql(
    `query($q:String){ urlRedirects(first:5, query:$q){ edges{ node{ id path target } } } }`,
    { q: `path:${path}` },
  );
  if (existing.urlRedirects.edges.find((e) => e.node.path === path)) {
    console.log(`  ⏭  ${path}  (redirection déjà présente)`);
    skipped++;
    log.push({ handle: p.handle, skipped: true });
    continue;
  }
  const d = await gql(
    `mutation($input: UrlRedirectInput!){
      urlRedirectCreate(urlRedirect: $input){ urlRedirect{ id path target } userErrors{ field message } }
    }`,
    { input: { path, target } },
  );
  const errs = d.urlRedirectCreate.userErrors;
  if (errs.length) {
    console.log(`  ❌ ${path}: ${JSON.stringify(errs)}`);
    log.push({ handle: p.handle, errors: errs });
  } else {
    created++;
    console.log(`  ✅ ${path.padEnd(50)} → ${target}   (productType: ${p.productType || "?"})`);
    log.push({ handle: p.handle, path, target });
  }
  await sleep(220);
}

console.log(`\n✅ ${created} redirections 301 créées, ${skipped} déjà présentes.`);
writeFileSync(resolve(__dirname, "..", "setup-archived-redirects.log.json"), JSON.stringify(log, null, 2));
