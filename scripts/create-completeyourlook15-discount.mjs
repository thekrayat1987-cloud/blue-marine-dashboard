#!/usr/bin/env node
/**
 * Create COMPLETEYOURLOOK15 — 15% off New Arrivals collection.
 * Used in the WhatsApp post-purchase upsell for single-item buyers.
 */
import { readFileSync } from "node:fs";
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

async function gql(query, variables = {}) {
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  return r.json();
}

const CODE = "COMPLETEYOURLOOK15";

// 1) Find the New Arrivals collection
const colRes = await gql(
  `{ collectionByHandle(handle: "new-collection") { id title productsCount { count } } }`
);
const col = colRes.data?.collectionByHandle;
if (!col) {
  console.error("❌ Collection /collections/new-collection not found");
  process.exit(1);
}
console.log(`Targeting "${col.title}" (${col.productsCount.count} products)`);

// 2) Delete existing code if any
const existing = await gql(
  `query($c: String!) { codeDiscountNodeByCode(code: $c) { id } }`,
  { c: CODE }
);
if (existing.data?.codeDiscountNodeByCode?.id) {
  await gql(
    `mutation($id: ID!) { discountCodeDelete(id: $id) { deletedCodeDiscountId } }`,
    { id: existing.data.codeDiscountNodeByCode.id }
  );
  console.log(`Deleted previous ${CODE}`);
}

// 3) Create the discount
const startsAt = new Date().toISOString();
const endsAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();
const createRes = await gql(
  `mutation($input: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $input) {
      codeDiscountNode {
        id
        codeDiscount {
          ... on DiscountCodeBasic {
            title
            status
            summary
            codes(first: 1) { edges { node { code } } }
            endsAt
            appliesOncePerCustomer
          }
        }
      }
      userErrors { field message }
    }
  }`,
  {
    input: {
      title: "Complete your look — single-item buyer upsell",
      code: CODE,
      startsAt,
      endsAt,
      customerSelection: { all: true },
      customerGets: {
        value: { percentage: 0.15 },
        items: { collections: { add: [col.id] } },
      },
      appliesOncePerCustomer: true,
      combinesWith: { productDiscounts: false, orderDiscounts: false, shippingDiscounts: true },
    },
  }
);

const errs = createRes.data?.discountCodeBasicCreate?.userErrors || [];
if (errs.length) {
  console.error("❌ Errors:");
  for (const e of errs) console.error(`   - ${e.field?.join(".")}: ${e.message}`);
  process.exit(1);
}

const node = createRes.data.discountCodeBasicCreate.codeDiscountNode;
console.log("\n✅ Discount created");
console.log(`   code   : ${node.codeDiscount.codes.edges[0].node.code}`);
console.log(`   summary: ${node.codeDiscount.summary}`);
console.log(`   status : ${node.codeDiscount.status}`);
console.log(`   1/cust : ${node.codeDiscount.appliesOncePerCustomer}`);
console.log("\nAuto-apply URLs:");
console.log(`   AR: https://bluemarineatelier.com/discount/${CODE}?redirect=/collections/new-collection`);
console.log(`   EN: https://bluemarineatelier.com/en-us/discount/${CODE}?redirect=/collections/new-collection`);
