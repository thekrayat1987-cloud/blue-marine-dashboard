#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
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

const COLLECTION_ID = "gid://shopify/Collection/504710431020";
const FILE_PATH = path.resolve(__dirname, "alkhairan-cover", "alkhairan-cover.jpg");
const FILENAME = "alkhairan-cover.jpg";
const MIME = "image/jpeg";

const buf = fs.readFileSync(FILE_PATH);
console.log(`Image: ${FILE_PATH} (${(buf.length / 1024).toFixed(1)} KB)`);

console.log("\n1. stagedUploadsCreate...");
const staged = await gql(
  `mutation($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets { url resourceUrl parameters { name value } }
      userErrors { field message }
    }
  }`,
  {
    input: [{
      resource: "IMAGE",
      filename: FILENAME,
      mimeType: MIME,
      fileSize: String(buf.length),
      httpMethod: "POST",
    }],
  },
);
if (staged.stagedUploadsCreate.userErrors.length) throw new Error(JSON.stringify(staged.stagedUploadsCreate.userErrors));
const target = staged.stagedUploadsCreate.stagedTargets[0];
console.log(`   target: ${target.url}`);
console.log(`   resourceUrl: ${target.resourceUrl}`);

console.log("\n2. POST file to staged target...");
const form = new FormData();
for (const p of target.parameters) form.append(p.name, p.value);
form.append("file", new Blob([new Uint8Array(buf)], { type: MIME }), FILENAME);
const upRes = await fetch(target.url, { method: "POST", body: form });
if (!upRes.ok && upRes.status !== 201 && upRes.status !== 204) {
  throw new Error(`Upload failed: ${upRes.status} ${await upRes.text()}`);
}
console.log(`   ✅ uploaded (${upRes.status})`);

console.log("\n3. collectionUpdate with image src...");
const upd = await gql(
  `mutation($input: CollectionInput!) {
    collectionUpdate(input: $input) {
      collection { id image { url width height } }
      userErrors { field message }
    }
  }`,
  {
    input: {
      id: COLLECTION_ID,
      image: { src: target.resourceUrl, altText: "AlKhairan — summer resort capsule by Atelier Blue Marine" },
    },
  },
);
if (upd.collectionUpdate.userErrors.length) throw new Error(JSON.stringify(upd.collectionUpdate.userErrors));

await sleep(1500);
const verify = await gql(
  `query($id: ID!) { collection(id: $id) { id handle title image { url width height } } }`,
  { id: COLLECTION_ID },
);
console.log(`   ✅ ${verify.collection.title}: ${verify.collection.image?.width}x${verify.collection.image?.height}`);
console.log(`      ${verify.collection.image?.url}`);
