#!/usr/bin/env node
// Audit duplicate images across all Shopify products.
// Detection strategies:
//   1. Same image URL referenced twice in the same product (exact dup)
//   2. Same Shopify image filename base (before resize suffix) — likely the
//      "standardized + original kept" pattern from 2026-05-08
//   3. Perceptual hash match (downloaded thumbnails, dHash) for visually
//      identical images stored under different filenames
//
// Output: scripts/duplicate-images-report.json + console summary.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envText = fs.readFileSync(path.resolve(__dirname, "..", ".env.local"), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

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

console.log("1. Fetching all products + media…");
let cursor = null;
const all = [];
while (true) {
  const d = await gql(
    `query($c: String) {
      products(first: 50, after: $c) {
        pageInfo { hasNextPage endCursor }
        edges { node {
          id handle title status
          variants(first: 1) { edges { node { sku } } }
          featuredImage { url width height }
          media(first: 50) { edges { node {
            id
            ... on MediaImage { image { url width height } }
          } } }
        } }
      }
    }`,
    { c: cursor },
  );
  for (const e of d.products.edges) all.push(e.node);
  process.stdout.write(`   ${all.length}\r`);
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}
console.log(`\n   ${all.length} produits récupérés`);

// Helpers --------------------------------------------------------------------

// Strip Shopify CDN resize/version params and resize suffix in filename.
// e.g. "https://cdn.shopify.com/.../files/foo_864x1536.jpg?v=123" → "foo"
function shopifyBaseName(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    const file = u.pathname.split("/").pop() || "";
    // Drop extension
    const noExt = file.replace(/\.(jpe?g|png|webp|gif|avif)$/i, "");
    // Drop common Shopify size suffix: _2048x, _864x1536, _1024x1024 etc.
    const noSize = noExt.replace(/_\d+x\d*$/i, "").replace(/_\d+x$/i, "");
    return noSize;
  } catch {
    return url;
  }
}

// Difference-hash (dHash) 9x8 → 64-bit. Compact, robust to resize/recompression.
async function dHash(buffer) {
  const raw = await sharp(buffer)
    .grayscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer();
  let bits = "";
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = raw[y * 9 + x];
      const right = raw[y * 9 + x + 1];
      bits += left < right ? "1" : "0";
    }
  }
  // Pack into hex
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

function hammingHex(a, b) {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

async function fetchThumb(url) {
  // Force CDN to give us a small thumb to save bandwidth
  const small = url.includes("?")
    ? url.replace(/(\.(?:jpe?g|png|webp))(\?|$)/i, "_256x$1$2")
    : url.replace(/(\.(?:jpe?g|png|webp))$/i, "_256x$1");
  const r = await fetch(small);
  if (!r.ok) {
    const r2 = await fetch(url);
    if (!r2.ok) throw new Error(`fetch ${r2.status}`);
    return Buffer.from(await r2.arrayBuffer());
  }
  return Buffer.from(await r.arrayBuffer());
}

// Analyze each product ------------------------------------------------------

console.log("\n2. Analyse des doublons par produit…");
const report = [];
let processed = 0;
for (const p of all) {
  processed++;
  if (p.status !== "ACTIVE") continue;
  const mediaImages = (p.media?.edges || [])
    .map((e) => e.node)
    .filter((n) => n.image?.url)
    .map((n) => ({ mediaId: n.id, url: n.image.url, w: n.image.width, h: n.image.height }));
  if (mediaImages.length < 2) continue;

  // Strategy 1+2: URL/base-name grouping
  const byBase = new Map();
  for (const m of mediaImages) {
    const base = shopifyBaseName(m.url);
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push(m);
  }
  const baseGroups = [...byBase.values()].filter((g) => g.length > 1);

  // Strategy 3: dHash on each image, group by Hamming ≤ 6
  let hashGroups = [];
  try {
    const hashes = await Promise.all(
      mediaImages.map(async (m) => {
        try {
          const buf = await fetchThumb(m.url);
          return { ...m, hash: await dHash(buf) };
        } catch (err) {
          return { ...m, hash: null, err: String(err.message || err) };
        }
      }),
    );
    const groups = [];
    const used = new Set();
    for (let i = 0; i < hashes.length; i++) {
      if (used.has(i) || !hashes[i].hash) continue;
      const cluster = [hashes[i]];
      used.add(i);
      for (let j = i + 1; j < hashes.length; j++) {
        if (used.has(j) || !hashes[j].hash) continue;
        if (hammingHex(hashes[i].hash, hashes[j].hash) <= 6) {
          cluster.push(hashes[j]);
          used.add(j);
        }
      }
      if (cluster.length > 1) groups.push(cluster);
    }
    hashGroups = groups;
  } catch (err) {
    console.warn(`  ${p.handle}: hash error ${err.message}`);
  }

  if (baseGroups.length === 0 && hashGroups.length === 0) continue;

  report.push({
    handle: p.handle,
    sku: p.variants?.edges?.[0]?.node?.sku || "",
    title: p.title,
    totalImages: mediaImages.length,
    sameBaseName: baseGroups.map((g) => g.map((m) => ({ mediaId: m.mediaId, url: m.url, dim: `${m.w}x${m.h}` }))),
    visuallyIdentical: hashGroups.map((g) => g.map((m) => ({ mediaId: m.mediaId, url: m.url, dim: `${m.w}x${m.h}` }))),
  });
  const dupCount = baseGroups.length + hashGroups.length;
  console.log(`   [${processed}/${all.length}] ${p.variants?.edges?.[0]?.node?.sku || p.handle}: ${dupCount} groupe(s) de doublons`);
}

// Save report ---------------------------------------------------------------

const outPath = path.resolve(__dirname, "duplicate-images-report.json");
fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), totalProducts: all.length, productsWithDuplicates: report.length, report }, null, 2));

console.log(`\n✅ Rapport: ${outPath}`);
console.log(`   ${report.length} produits avec doublons (sur ${all.length} actifs)`);
const totalGroups = report.reduce((s, r) => s + r.sameBaseName.length + r.visuallyIdentical.length, 0);
console.log(`   ${totalGroups} groupes de doublons au total`);
