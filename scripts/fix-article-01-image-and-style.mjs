#!/usr/bin/env node
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

const ARTICLE_ID = "gid://shopify/Article/705821802796"; // What Is a Darra?
const SOURCE_PRODUCT_HANDLE = process.env.DARRA_HANDLE || "a144";

console.log("1. Fetch source product image (A147 Maha)...");
const src = await gql(
  `query($h: String!) {
    productByHandle(handle: $h) {
      id title
      featuredImage { url width height altText }
    }
  }`,
  { h: SOURCE_PRODUCT_HANDLE },
);
const srcImg = src.productByHandle.featuredImage;
console.log(`   Source: ${srcImg.url} (${srcImg.width}×${srcImg.height})`);

console.log("2. Download + crop to 16:9...");
const outDir = path.resolve(__dirname, "darra-hero-images");
fs.mkdirSync(outDir, { recursive: true });
const finalFile = path.join(outDir, "01-what-is-a-darra.jpg");

const dl = await fetch(srcImg.url);
const buf = Buffer.from(await dl.arrayBuffer());

// Source is 864×1536 portrait. We want a 16:9 hero (1536×864).
// Best crop: take the upper-mid section showing torso + face area of the dress.
// We'll do a content-aware crop by extracting the central horizontal band of the portrait.
// Strategy: resize source to fit width = 1536 (so it becomes 1536×~2730), then crop center to 1536×864 vertically biased upward.
const meta = await sharp(buf).metadata();
const targetW = 1536;
const scale = targetW / meta.width;
const scaledH = Math.round(meta.height * scale);
const targetH = 864;
const top = Math.round(scaledH * 0.15); // crop bias upward to keep upper body / face area

await sharp(buf)
  .resize(targetW, scaledH)
  .extract({ left: 0, top, width: targetW, height: targetH })
  .jpeg({ quality: 92, mozjpeg: true })
  .toFile(finalFile);
const fs2 = fs.statSync(finalFile);
console.log(`   final: ${finalFile} (${(fs2.size / 1024).toFixed(0)} KB)`);

console.log("3. Upload to Shopify Files...");
const imgBuf = fs.readFileSync(finalFile);
const filename = `darra-journal-01-what-is-a-darra.jpg`;
const staged = await gql(
  `mutation($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets { url resourceUrl parameters { name value } }
      userErrors { field message }
    }
  }`,
  {
    input: [{ resource: "FILE", filename, mimeType: "image/jpeg", fileSize: String(imgBuf.length), httpMethod: "POST" }],
  },
);
if (staged.stagedUploadsCreate.userErrors.length) throw new Error(JSON.stringify(staged.stagedUploadsCreate.userErrors));
const target = staged.stagedUploadsCreate.stagedTargets[0];
const form = new FormData();
for (const par of target.parameters) form.append(par.name, par.value);
form.append("file", new Blob([new Uint8Array(imgBuf)], { type: "image/jpeg" }), filename);
const upRes = await fetch(target.url, { method: "POST", body: form });
if (!upRes.ok && upRes.status !== 201 && upRes.status !== 204) throw new Error(`upload status ${upRes.status}`);

const fc = await gql(
  `mutation($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files { id ... on MediaImage { image { url width height } } }
      userErrors { field message }
    }
  }`,
  {
    files: [{ originalSource: target.resourceUrl, contentType: "IMAGE", alt: "What is a darra — Atelier Blue Marine Maha Daraa" }],
  },
);
if (fc.fileCreate.userErrors.length) throw new Error(JSON.stringify(fc.fileCreate.userErrors));
const fileId = fc.fileCreate.files[0].id;

let imageUrl = null;
for (let i = 0; i < 30; i++) {
  await sleep(1000);
  const chk = await gql(`query($id: ID!) { node(id: $id) { ... on MediaImage { image { url } } } }`, { id: fileId });
  if (chk.node?.image?.url) { imageUrl = chk.node.image.url; break; }
}
if (!imageUrl) throw new Error("Image processing timeout");
console.log(`   ✅ ${imageUrl}`);

console.log("4. Attach to article #1...");
const upd = await gql(
  `mutation($id: ID!, $article: ArticleUpdateInput!) {
    articleUpdate(id: $id, article: $article) {
      article { id image { url } }
      userErrors { field message code }
    }
  }`,
  {
    id: ARTICLE_ID,
    article: {
      image: { url: imageUrl, altText: "Atelier Blue Marine Maha Daraa — what is a darra hero" },
    },
  },
);
if (upd.articleUpdate.userErrors.length) throw new Error(JSON.stringify(upd.articleUpdate.userErrors));
console.log(`   ✅ image attached`);

console.log("\nDone. Refresh the blog page.");
console.log(`Article URL: https://bluemarineatelier.com/blogs/darra-journal/what-is-a-darra`);
