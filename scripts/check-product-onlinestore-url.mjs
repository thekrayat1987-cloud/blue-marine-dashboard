#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const SHOP = process.env.SHOPIFY_STORE_DOMAIN || 'c7z8qr-7w.myshopify.com';
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

const productId = "gid://shopify/Product/10162856657196";

const query = `{
  product(id: "${productId}") {
    id
    title
    handle
    status
    onlineStoreUrl
    onlineStorePreviewUrl
    resourcePublications(first: 20) {
      edges {
        node {
          isPublished
          publication { name id }
        }
      }
    }
  }
}`;

const res = await fetch(`https://${SHOP}/admin/api/2024-10/graphql.json`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
  body: JSON.stringify({ query })
});
const data = await res.json();
console.log(JSON.stringify(data, null, 2));
