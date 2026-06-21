// Reads dedupe-manual-input.json and downloads each product's featured image
// to /tmp/dedupe-images/ as <SKU>.jpg, plus prints the public CDN URL.
import { writeFile, mkdir } from "node:fs/promises";

const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const ENDPOINT = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

async function gql(query, variables) {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const fs = await import("node:fs/promises");
const rows = JSON.parse(
  await fs.readFile(new URL("../dedupe-manual-input.json", import.meta.url), "utf8"),
);

await mkdir("/tmp/dedupe-images", { recursive: true });

const results = [];
for (const row of rows) {
  // Look up the product ID by handle
  const d = await gql(
    `query($q: String!) { products(first: 1, query: $q) { edges { node {
      id title handle featuredImage { url }
    } } } }`,
    { q: `handle:${row.handle}` },
  );
  const node = d.products.edges[0]?.node;
  if (!node) { console.log(`MISS ${row.sku} (${row.handle})`); continue; }
  const imgUrl = node.featuredImage?.url;
  if (!imgUrl) { console.log(`NO IMAGE ${row.sku}`); continue; }
  // Download (small variant — Shopify supports URL transforms)
  const small = imgUrl.replace(/(\.[a-z]+)(\?|$)/i, "_400x$1$2");
  const r = await fetch(small);
  const buf = Buffer.from(await r.arrayBuffer());
  const path = `/tmp/dedupe-images/${row.sku}.jpg`;
  await writeFile(path, buf);
  results.push({ sku: row.sku, handle: row.handle, path, url: small });
  console.log(`✓ ${row.sku} → ${path}`);
}

await writeFile(
  "/tmp/dedupe-images/index.json",
  JSON.stringify(results, null, 2),
);
console.log(`\nDownloaded ${results.length}/${rows.length} images`);
