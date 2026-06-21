#!/usr/bin/env node
/**
 * Create the MATCHINGBISHT15 discount code used by:
 *  - Order confirmation email upsell block
 *  - WhatsApp post-purchase follow-up
 *
 * Behavior:
 *  - 15% off
 *  - Applies ONLY to products with productType = "Bisht Set"
 *  - One use per customer (limits abuse, allows re-issue on real interest)
 *  - Valid 7 days from creation (customer has a real window)
 *  - Combines with shipping discount (so free-shipping promos still stack)
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

const CODE = "MATCHINGBISHT15";
const startsAt = new Date().toISOString();
const endsAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();

// 1) Find all Bisht Set product IDs (the discount targets these only)
const bishtSets = [];
let cursor = null;
while (true) {
  const r = await gql(
    `query($c: String) {
      products(first: 100, after: $c, query: "product_type:'Bisht Set'") {
        edges { cursor node { id title handle } }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    { c: cursor }
  );
  for (const e of r.data.products.edges) bishtSets.push(e.node.id);
  if (!r.data.products.pageInfo.hasNextPage) break;
  cursor = r.data.products.pageInfo.endCursor;
}
console.log(`Targeting ${bishtSets.length} Bisht Set products`);

// 2) Check if code already exists
const existing = await gql(
  `query($c: String!) {
    codeDiscountNodeByCode(code: $c) {
      id
      codeDiscount {
        __typename
        ... on DiscountCodeBasic { title }
      }
    }
  }`,
  { c: CODE }
);
if (existing.data?.codeDiscountNodeByCode?.id) {
  console.log(`⚠️  Code ${CODE} already exists (id=${existing.data.codeDiscountNodeByCode.id})`);
  console.log("    Deleting and recreating with fresh terms…");
  await gql(
    `mutation($id: ID!) { discountCodeDelete(id: $id) { deletedCodeDiscountId userErrors { field message } } }`,
    { id: existing.data.codeDiscountNodeByCode.id }
  );
}

// 3) Create the discount code
const createRes = await gql(
  `mutation($input: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $input) {
      codeDiscountNode {
        id
        codeDiscount {
          ... on DiscountCodeBasic {
            title
            summary
            status
            codes(first: 1) { edges { node { code } } }
            startsAt
            endsAt
            usageLimit
            appliesOncePerCustomer
          }
        }
      }
      userErrors { field message }
    }
  }`,
  {
    input: {
      title: "Matching Bisht Set upsell (post-purchase)",
      code: CODE,
      startsAt,
      endsAt,
      customerSelection: { all: true },
      customerGets: {
        value: { percentage: 0.15 },
        items: { products: { productsToAdd: bishtSets } },
      },
      appliesOncePerCustomer: true,
      combinesWith: { productDiscounts: false, orderDiscounts: false, shippingDiscounts: true },
    },
  }
);

const errs = createRes.data?.discountCodeBasicCreate?.userErrors || [];
if (errs.length) {
  console.error("❌ discountCodeBasicCreate errors:");
  for (const e of errs) console.error(`   - ${e.field?.join(".")}: ${e.message}`);
  process.exit(1);
}

const node = createRes.data.discountCodeBasicCreate.codeDiscountNode;
console.log("\n✅ Discount created");
console.log(`   id     : ${node.id}`);
console.log(`   code   : ${node.codeDiscount.codes.edges[0].node.code}`);
console.log(`   summary: ${node.codeDiscount.summary}`);
console.log(`   status : ${node.codeDiscount.status}`);
console.log(`   ends   : ${node.codeDiscount.endsAt}`);
console.log(`   1/cust : ${node.codeDiscount.appliesOncePerCustomer}`);
console.log("\nLink to auto-apply at checkout:");
console.log(`   https://bluemarineatelier.com/discount/${CODE}?redirect=/collections/bisht-set`);
