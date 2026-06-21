#!/usr/bin/env node
/**
 * Audit Atelier Blue Marine against Google's Free Listings 40-point checklist.
 * Focuses on items NOT already covered by audit-gmc-readiness.mjs:
 *  - Variant-level mm-google-shopping metafields (color, size, age_group, gender)
 *  - Brand (vendor) coverage
 *  - Item group ID (Shopify auto-groups variants under product id)
 *  - GTIN/MPN coverage at variant level
 *  - Product-level google_product_category, custom_product flags
 *  - Shop policies (refund / shipping) URLs
 *  - Markets / shipping zones
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

const URL_ = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${process.env.SHOPIFY_API_VERSION || "2024-10"}/graphql.json`;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

async function gql(q, v = {}) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query: q, variables: v }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

// ----- Shop policies -----
const shopData = await gql(`{
  shop {
    name
    primaryDomain { url }
    shopPolicies { type url body }
  }
}`);
const policies = Object.fromEntries(
  shopData.shop.shopPolicies.map((p) => [p.type, { url: p.url, hasBody: !!(p.body && p.body.trim().length > 50) }]),
);

// ----- Markets / shipping -----
const markets = await gql(`{
  markets(first: 20) {
    edges { node { id name enabled webPresence { defaultLocale { locale } rootUrls { locale url } } regions(first:20){ edges{ node { name } } } } }
  }
}`);

// ----- Products + variants -----
const products = [];
let cursor = null;
let page = 0;
while (true) {
  page++;
  const d = await gql(
    `query($cursor:String){
      products(first: 25, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        edges { node {
          id handle title status vendor productType
          gpc: metafield(namespace:"mm-google-shopping", key:"google_product_category") { value }
          customProduct: metafield(namespace:"mm-google-shopping", key:"custom_product") { value }
          ageGroup: metafield(namespace:"mm-google-shopping", key:"age_group") { value }
          gender: metafield(namespace:"mm-google-shopping", key:"gender") { value }
          color: metafield(namespace:"mm-google-shopping", key:"color") { value }
          size: metafield(namespace:"mm-google-shopping", key:"size") { value }
          variants(first: 100) {
            edges { node {
              id title sku barcode
              vColor: metafield(namespace:"mm-google-shopping", key:"color") { value }
              vSize: metafield(namespace:"mm-google-shopping", key:"size") { value }
              vAg: metafield(namespace:"mm-google-shopping", key:"age_group") { value }
              vGen: metafield(namespace:"mm-google-shopping", key:"gender") { value }
            } }
          }
        } }
      }
    }`,
    { cursor },
  );
  for (const e of d.products.edges) products.push(e.node);
  process.stderr.write(`page ${page} (${products.length} products)\n`);
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}

const active = products.filter((p) => p.status === "ACTIVE");

const productCounts = {
  total: products.length,
  active: active.length,
  with_vendor: active.filter((p) => p.vendor && p.vendor.trim()).length,
  with_product_type: active.filter((p) => p.productType && p.productType.trim()).length,
  with_google_category: active.filter((p) => p.gpc?.value).length,
  with_custom_product_flag: active.filter((p) => p.customProduct?.value === "true").length,
  with_product_color: active.filter((p) => p.color?.value).length,
  with_product_size: active.filter((p) => p.size?.value).length,
  with_product_age_group: active.filter((p) => p.ageGroup?.value).length,
  with_product_gender: active.filter((p) => p.gender?.value).length,
};

let totalVariants = 0;
let vColor = 0, vSize = 0, vAg = 0, vGen = 0, vBarcode = 0, vSku = 0;
for (const p of active) {
  for (const ve of p.variants.edges) {
    const v = ve.node;
    totalVariants++;
    if (v.vColor?.value) vColor++;
    if (v.vSize?.value) vSize++;
    if (v.vAg?.value) vAg++;
    if (v.vGen?.value) vGen++;
    if (v.barcode && v.barcode.trim()) vBarcode++;
    if (v.sku && v.sku.trim()) vSku++;
  }
}

const variantCounts = {
  total: totalVariants,
  with_color: vColor,
  with_size: vSize,
  with_age_group: vAg,
  with_gender: vGen,
  with_barcode_gtin: vBarcode,
  with_sku_mpn: vSku,
};

const samples = {
  no_google_category: active.filter((p) => !p.gpc?.value).slice(0, 10).map((p) => p.handle),
  no_custom_product: active.filter((p) => p.customProduct?.value !== "true").slice(0, 10).map((p) => p.handle),
  no_color: active.filter((p) => !p.color?.value).slice(0, 10).map((p) => p.handle),
};

const report = {
  generated_at: new Date().toISOString(),
  shop: shopData.shop.name,
  primary_domain: shopData.shop.primaryDomain.url,
  policies: {
    refund: policies.REFUND_POLICY || null,
    shipping: policies.SHIPPING_POLICY || null,
    privacy: policies.PRIVACY_POLICY || null,
    terms: policies.TERMS_OF_SERVICE || null,
    contact: policies.CONTACT_INFORMATION || null,
  },
  markets: markets.markets.edges.map((e) => ({
    name: e.node.name,
    enabled: e.node.enabled,
    defaultLocale: e.node.webPresence?.defaultLocale?.locale,
    rootUrls: e.node.webPresence?.rootUrls,
    regions: e.node.regions.edges.map((r) => r.node.name),
  })),
  products: productCounts,
  variants: variantCounts,
  samples,
};

writeFileSync(resolve(__dirname, "..", "gmc-free-listings-checklist.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
