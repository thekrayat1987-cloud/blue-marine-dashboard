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

// Renames keep handles unchanged so existing share links keep working.
const RENAMES = [
  { sku: "A140", enTitle: "A140 – Maya Daraa 2-Piece Set",   arTitle: "A140 – مايا درّاعة طقم ٢ قطع",   from: "Lujain → Maya" },
  { sku: "A141", enTitle: "A141 – Shams Daraa 2-Piece Set",  arTitle: "A141 – شمس درّاعة طقم ٢ قطع",   from: "Zhaira → Shams" },
  { sku: "A142", enTitle: "A142 – Marjan Daraa 2-Piece Set", arTitle: "A142 – مرجان درّاعة طقم ٢ قطع", from: "Bayan → Marjan" },
  { sku: "A143", enTitle: "A143 – Loulwa Caftan 2-Piece Set", arTitle: "A143 – لؤلؤة قفطان طقم ٢ قطع", from: "Aroob → Loulwa" },
];

async function findProduct(sku) {
  const d = await gql(
    `query($q: String!) { products(first: 1, query: $q) { edges { node { id handle title } } } }`,
    { q: `sku:${sku}` },
  );
  return d.products.edges[0]?.node || null;
}

async function updateEN(id, newTitle) {
  const d = await gql(
    `mutation($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id title handle }
        userErrors { field message }
      }
    }`,
    { input: { id, title: newTitle } },
  );
  if (d.productUpdate.userErrors.length) throw new Error(JSON.stringify(d.productUpdate.userErrors));
  return d.productUpdate.product;
}

async function updateAR(id, newArTitle) {
  // Get fresh digest after EN update
  const tr = await gql(
    `query($id: ID!) { translatableResource(resourceId: $id) { translatableContent { key digest locale value } } }`,
    { id },
  );
  const titleEntry = tr.translatableResource?.translatableContent?.find((c) => c.key === "title");
  if (!titleEntry) throw new Error(`No title key on ${id}`);

  const d = await gql(
    `mutation($id: ID!, $t: [TranslationInput!]!) {
      translationsRegister(resourceId: $id, translations: $t) {
        translations { key value locale }
        userErrors { field message }
      }
    }`,
    {
      id,
      t: [{ key: "title", value: newArTitle, locale: "ar", translatableContentDigest: titleEntry.digest }],
    },
  );
  if (d.translationsRegister.userErrors.length) throw new Error(JSON.stringify(d.translationsRegister.userErrors));
}

for (const r of RENAMES) {
  console.log(`\n[${r.sku}] ${r.from}`);
  const p = await findProduct(r.sku);
  if (!p) { console.log(`  ⚠️  not found`); continue; }
  console.log(`  current EN: ${p.title}`);
  console.log(`  handle (unchanged): ${p.handle}`);

  if (p.title !== r.enTitle) {
    const updated = await updateEN(p.id, r.enTitle);
    console.log(`  ✅ EN → ${updated.title}`);
  } else {
    console.log(`  ✓ EN already correct`);
  }

  await sleep(500);

  await updateAR(p.id, r.arTitle);
  console.log(`  ✅ AR → ${r.arTitle}`);
}

console.log("\nDone. Verifying...");
await sleep(800);

for (const r of RENAMES) {
  const p = await findProduct(r.sku);
  const tr = await gql(
    `query($id: ID!) { translatableResource(resourceId: $id) { translations(locale: "ar") { key value } } }`,
    { id: p.id },
  );
  const ar = tr.translatableResource?.translations?.find((t) => t.key === "title")?.value;
  console.log(`  ${r.sku}: EN="${p.title}" | AR="${ar}"`);
}
