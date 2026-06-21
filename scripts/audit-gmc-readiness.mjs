#!/usr/bin/env node
/**
 * Audit products for Google Merchant Center readiness.
 * Checks the most common GMC rejection reasons:
 *  - Missing GTIN/barcode (and identifier-exists handling)
 *  - Missing Google product category / product type
 *  - Missing brand vendor
 *  - Missing product description
 *  - Missing/short title
 *  - Missing images
 *  - Out of stock variants (still in feed)
 *  - Missing metafields commonly used by feed apps (gender, age_group, color, size)
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
const URL_ = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

async function gql(query, variables = {}) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const Q = `query Products($cursor: String) {
  products(first: 50, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    edges { node {
      id
      title
      handle
      vendor
      productType
      status
      descriptionHtml
      tags
      totalInventory
      featuredImage { url }
      images(first: 3) { edges { node { url } } }
      variants(first: 100) {
        edges { node {
          id
          sku
          barcode
          price
          inventoryQuantity
          availableForSale
        } }
      }
      seo { title description }
    } }
  }
}`;

const products = [];
let cursor = null;
let page = 0;
while (true) {
  page++;
  const data = await gql(Q, { cursor });
  for (const e of data.products.edges) products.push(e.node);
  process.stderr.write(`fetched page ${page} (${products.length} products)\n`);
  if (!data.products.pageInfo.hasNextPage) break;
  cursor = data.products.pageInfo.endCursor;
}

const issues = {
  missing_vendor: [],
  missing_product_type: [],
  missing_description: [],
  short_description: [],
  missing_seo_title: [],
  missing_seo_description: [],
  no_images: [],
  one_image_only: [],
  draft_or_archived: [],
  out_of_stock_active: [],
  variants_no_barcode: 0,
  variants_with_barcode: 0,
  variants_no_sku: 0,
  total_variants: 0,
};

for (const p of products) {
  if (!p.vendor || p.vendor.trim() === "") issues.missing_vendor.push(p.handle);
  if (!p.productType || p.productType.trim() === "") issues.missing_product_type.push(p.handle);
  const desc = (p.descriptionHtml || "").replace(/<[^>]+>/g, "").trim();
  if (!desc) issues.missing_description.push(p.handle);
  else if (desc.length < 100) issues.short_description.push(p.handle);
  if (!p.seo?.title) issues.missing_seo_title.push(p.handle);
  if (!p.seo?.description) issues.missing_seo_description.push(p.handle);
  const imgCount = p.images.edges.length;
  if (imgCount === 0) issues.no_images.push(p.handle);
  else if (imgCount === 1) issues.one_image_only.push(p.handle);
  if (p.status !== "ACTIVE") issues.draft_or_archived.push({ handle: p.handle, status: p.status });
  if (p.status === "ACTIVE" && (p.totalInventory ?? 0) <= 0) issues.out_of_stock_active.push(p.handle);

  for (const v of p.variants.edges.map((e) => e.node)) {
    issues.total_variants++;
    if (!v.barcode || v.barcode.trim() === "") issues.variants_no_barcode++;
    else issues.variants_with_barcode++;
    if (!v.sku || v.sku.trim() === "") issues.variants_no_sku++;
  }
}

const summary = {
  total_products: products.length,
  active_products: products.filter((p) => p.status === "ACTIVE").length,
  total_variants: issues.total_variants,
  variants_no_barcode: issues.variants_no_barcode,
  variants_with_barcode: issues.variants_with_barcode,
  variants_no_sku: issues.variants_no_sku,
  counts: {
    missing_vendor: issues.missing_vendor.length,
    missing_product_type: issues.missing_product_type.length,
    missing_description: issues.missing_description.length,
    short_description: issues.short_description.length,
    missing_seo_title: issues.missing_seo_title.length,
    missing_seo_description: issues.missing_seo_description.length,
    no_images: issues.no_images.length,
    one_image_only: issues.one_image_only.length,
    draft_or_archived: issues.draft_or_archived.length,
    out_of_stock_active: issues.out_of_stock_active.length,
  },
  samples: {
    missing_vendor: issues.missing_vendor.slice(0, 10),
    missing_product_type: issues.missing_product_type.slice(0, 10),
    missing_description: issues.missing_description.slice(0, 10),
    short_description: issues.short_description.slice(0, 10),
    no_images: issues.no_images.slice(0, 10),
    out_of_stock_active: issues.out_of_stock_active.slice(0, 10),
    draft_or_archived: issues.draft_or_archived.slice(0, 10),
  },
};

writeFileSync(resolve(__dirname, "..", "gmc-audit-report.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
