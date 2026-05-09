#!/usr/bin/env node
// Resize each product's featured image to 864×1536 (RGB JPEG) via cover-crop,
// upload as new media, and promote it to position 1. Original stays in gallery.
//
// Usage:
//   node scripts/standardize-featured-images.mjs                # fix all non-conforming
//   node scripts/standardize-featured-images.mjs A140 A141 ...  # fix specific SKUs
import fs from "node:fs";
import path from "node:path";
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
const TARGET_W = 864, TARGET_H = 1536;
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

const skuFilter = process.argv.slice(2).filter((a) => /^[A-Z]\d+$/i.test(a)).map((s) => s.toUpperCase());

console.log("1. Fetching products...");
let cursor = null, all = [];
while (true) {
  const d = await gql(
    `query($c: String) {
      products(first: 100, after: $c) {
        pageInfo { hasNextPage endCursor }
        edges { node {
          id handle title status productType
          variants(first: 1) { edges { node { sku } } }
          featuredImage { url width height altText }
          media(first: 30) { edges { node { id ... on MediaImage { image { url width height } } } } }
        } }
      }
    }`,
    { c: cursor },
  );
  for (const e of d.products.edges) all.push(e.node);
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}

const isPerfume = (p) => /parfum|perfume|عطر/i.test(p.title) || (p.productType || "").toLowerCase().includes("parfum");
const skuOf = (p) => p.variants?.edges?.[0]?.node?.sku || "";

const targets = all.filter((p) => {
  if (p.status !== "ACTIVE") return false;
  if (isPerfume(p)) return false;
  if (!p.featuredImage) return false;
  if (p.featuredImage.width === TARGET_W && p.featuredImage.height === TARGET_H) return false;
  if (skuFilter.length && !skuFilter.includes(skuOf(p))) return false;
  return true;
});

console.log(`   ${targets.length} produits à standardiser${skuFilter.length ? " (filtre SKU appliqué)" : ""}\n`);

async function fixOne(p, idx) {
  const sku = skuOf(p);
  const tag = `[${idx + 1}/${targets.length}] ${sku || p.handle}`;
  console.log(`\n${tag} — ${p.title}`);
  console.log(`  current: ${p.featuredImage.width}×${p.featuredImage.height}`);

  // 1. Download original
  const imgRes = await fetch(p.featuredImage.url);
  if (!imgRes.ok) { console.log(`  ❌ download ${imgRes.status}`); return; }
  const origBuf = Buffer.from(await imgRes.arrayBuffer());

  // 2. Resize via sharp — cover crop, centre, RGB JPEG
  const resized = await sharp(origBuf)
    .resize(TARGET_W, TARGET_H, { fit: "cover", position: "centre" })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
  const meta = await sharp(resized).metadata();
  console.log(`  resized: ${meta.width}×${meta.height} (${(resized.length/1024).toFixed(0)} KB)`);

  // 3. Stage upload
  const filename = `${sku || p.handle}-864x1536.jpg`;
  const staged = await gql(
    `mutation($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`,
    { input: [{ resource: "IMAGE", filename, mimeType: "image/jpeg", fileSize: String(resized.length), httpMethod: "POST" }] },
  );
  if (staged.stagedUploadsCreate.userErrors.length) throw new Error(JSON.stringify(staged.stagedUploadsCreate.userErrors));
  const target = staged.stagedUploadsCreate.stagedTargets[0];

  // 4. Upload to storage
  const form = new FormData();
  for (const par of target.parameters) form.append(par.name, par.value);
  form.append("file", new Blob([new Uint8Array(resized)], { type: "image/jpeg" }), filename);
  const upRes = await fetch(target.url, { method: "POST", body: form });
  if (!upRes.ok && upRes.status !== 201 && upRes.status !== 204) {
    throw new Error(`upload status ${upRes.status}`);
  }

  // 5. Attach as product media
  const altText = p.featuredImage.altText || p.title;
  const created = await gql(
    `mutation($id: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $id, media: $media) {
        media { id ... on MediaImage { id image { url width height } } status }
        mediaUserErrors { field message }
      }
    }`,
    { id: p.id, media: [{ originalSource: target.resourceUrl, mediaContentType: "IMAGE", alt: altText }] },
  );
  if (created.productCreateMedia.mediaUserErrors.length) throw new Error(JSON.stringify(created.productCreateMedia.mediaUserErrors));
  const newMediaId = created.productCreateMedia.media[0].id;

  // 6. Wait for media to finish processing
  let ready = false;
  for (let i = 0; i < 30 && !ready; i++) {
    await sleep(1000);
    const chk = await gql(`query($id: ID!) { node(id: $id) { ... on MediaImage { status image { url width height } } } }`, { id: newMediaId });
    if (chk.node?.status === "READY") ready = true;
  }
  if (!ready) console.log(`  ⚠️ media did not become READY in 30s, continuing`);

  // 7. Reorder: put the new media first
  const after = await gql(
    `query($id: ID!) { product(id: $id) { media(first: 50) { edges { node { id ... on MediaImage { image { width height } } } } } } }`,
    { id: p.id },
  );
  const ordered = [newMediaId, ...after.product.media.edges.map((e) => e.node.id).filter((id) => id !== newMediaId)];
  const moves = ordered.map((id, i) => ({ id, newPosition: String(i) }));
  const re = await gql(
    `mutation($id: ID!, $moves: [MoveInput!]!) {
      productReorderMedia(id: $id, moves: $moves) {
        job { id }
        userErrors { field message }
      }
    }`,
    { id: p.id, moves },
  );
  if (re.productReorderMedia.userErrors.length) throw new Error(JSON.stringify(re.productReorderMedia.userErrors));

  console.log(`  ✅ standardisé`);
}

let okCount = 0, failCount = 0;
for (let i = 0; i < targets.length; i++) {
  try {
    await fixOne(targets[i], i);
    okCount++;
  } catch (e) {
    failCount++;
    console.log(`  ❌ ${e.message.slice(0, 200)}`);
  }
  await sleep(400);
}

console.log(`\n=== ${okCount}/${targets.length} OK, ${failCount} erreurs ===`);
