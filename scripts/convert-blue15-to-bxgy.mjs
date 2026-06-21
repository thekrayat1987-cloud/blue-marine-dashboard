#!/usr/bin/env node
/**
 * Replace BLUE15 with a Buy-X-Get-Y discount:
 *   - Customer buys 1 daraa (any of: one-piece, two-piece, three-piece)
 *   - Customer gets 1 daraa at 15% off (Shopify discounts the cheaper one)
 *   - Limit: 1 use per order, 1 use per customer
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

const CODE = "BLUE15";

// 1) Find the 3 daraa collections
const colRes = await gql(
  `{
    one: collectionByHandle(handle: "one-piece-daraa") { id title productsCount { count } }
    two: collectionByHandle(handle: "2-piece-set-daraa") { id title productsCount { count } }
    three: collectionByHandle(handle: "3-piece-daraa-set") { id title productsCount { count } }
  }`
);
const cols = [colRes.data.one, colRes.data.two, colRes.data.three].filter(Boolean);
const colIds = cols.map((c) => c.id);
console.log("Eligible daraa collections:");
for (const c of cols) console.log(`  ${c.title.padEnd(25)} ${c.productsCount.count} products`);
console.log(`Total: ${cols.reduce((a, c) => a + c.productsCount.count, 0)} products`);

// 2) Delete existing BLUE15 (basic discount) if present
const existing = await gql(
  `query($c: String!) { codeDiscountNodeByCode(code: $c) { id codeDiscount { __typename } } }`,
  { c: CODE }
);
if (existing.data?.codeDiscountNodeByCode?.id) {
  await gql(
    `mutation($id: ID!) { discountCodeDelete(id: $id) { deletedCodeDiscountId userErrors { message } } }`,
    { id: existing.data.codeDiscountNodeByCode.id }
  );
  console.log(`\nDeleted previous BLUE15 (${existing.data.codeDiscountNodeByCode.codeDiscount.__typename})`);
}

// 3) Create BXGY
const startsAt = new Date().toISOString();
const endsAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();
const createRes = await gql(
  `mutation($input: DiscountCodeBxgyInput!) {
    discountCodeBxgyCreate(bxgyCodeDiscount: $input) {
      codeDiscountNode {
        id
        codeDiscount {
          ... on DiscountCodeBxgy {
            title
            status
            summary
            codes(first: 1) { edges { node { code } } }
            usesPerOrderLimit
            appliesOncePerCustomer
            customerBuys {
              value { ... on DiscountQuantity { quantity } }
            }
            customerGets {
              value {
                ... on DiscountOnQuantity {
                  effect { ... on DiscountPercentage { percentage } }
                  quantity { quantity }
                }
              }
            }
          }
        }
      }
      userErrors { field message }
    }
  }`,
  {
    input: {
      title: "BLUE15 — Second daraa 15% off (BXGY)",
      code: CODE,
      startsAt,
      endsAt,
      customerSelection: { all: true },
      customerBuys: {
        items: { collections: { add: colIds } },
        value: { quantity: "1" },
      },
      customerGets: {
        items: { collections: { add: colIds } },
        value: {
          discountOnQuantity: {
            quantity: "1",
            effect: { percentage: 0.15 },
          },
        },
      },
      usesPerOrderLimit: 1,
      appliesOncePerCustomer: true,
      combinesWith: { productDiscounts: false, orderDiscounts: false, shippingDiscounts: true },
    },
  }
);

if (!createRes.data?.discountCodeBxgyCreate) {
  console.error("\n❌ GraphQL response (no data):");
  console.error(JSON.stringify(createRes, null, 2));
  process.exit(1);
}
const errs = createRes.data?.discountCodeBxgyCreate?.userErrors || [];
if (errs.length) {
  console.error("\n❌ User errors:");
  for (const e of errs) console.error(`   - ${e.field?.join(".")}: ${e.message}`);
  process.exit(1);
}

const d = createRes.data.discountCodeBxgyCreate.codeDiscountNode.codeDiscount;
console.log("\n✅ BXGY discount created:");
console.log(`   code               : ${d.codes.edges[0].node.code}`);
console.log(`   summary            : ${d.summary}`);
console.log(`   status             : ${d.status}`);
console.log(`   uses per order     : ${d.usesPerOrderLimit || "(unlimited)"}`);
console.log(`   applies once/cust  : ${d.appliesOncePerCustomer}`);

console.log("\nAuto-apply URLs:");
console.log(`   AR: https://bluemarineatelier.com/discount/${CODE}?redirect=/collections/one-piece-daraa`);
console.log(`   EN: https://bluemarineatelier.com/en-us/discount/${CODE}?redirect=/collections/one-piece-daraa`);
