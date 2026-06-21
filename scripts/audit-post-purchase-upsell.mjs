#!/usr/bin/env node
/**
 * Audit the post-purchase upsell setup.
 * Reports what's live vs what still requires manual setup by Khadija.
 */
import { readFileSync, existsSync } from "node:fs";
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

const checks = [];

// 1) Discount code
const dr = await gql(
  `{
    codeDiscountNodeByCode(code: "MATCHINGBISHT15") {
      id
      codeDiscount {
        ... on DiscountCodeBasic {
          title
          status
          startsAt
          endsAt
          appliesOncePerCustomer
          asyncUsageCount
          customerGets {
            value { ... on DiscountPercentage { percentage } }
            items { ... on DiscountProducts { products(first: 1) { edges { node { id } } } productsCount: products { edges { node { id } } } } }
          }
        }
      }
    }
  }`
);
const d = dr.data?.codeDiscountNodeByCode?.codeDiscount;
checks.push({
  label: "Discount code MATCHINGBISHT15",
  ok: d?.status === "ACTIVE",
  detail: d
    ? `${d.status} • ${(d.customerGets?.value?.percentage * 100).toFixed(0)}% off • used ${d.asyncUsageCount} times • 1/customer=${d.appliesOncePerCustomer}`
    : "NOT FOUND",
});

// 2) Bisht Set collection
const cr = await gql(
  `{
    collectionByHandle(handle: "bisht-set") {
      id
      title
      productsCount { count }
      ruleSet { rules { column relation condition } }
    }
  }`
);
const col = cr.data?.collectionByHandle;
checks.push({
  label: "Smart collection /collections/bisht-set",
  ok: !!col && col.productsCount.count > 0,
  detail: col
    ? `${col.productsCount.count} products • rule: ${col.ruleSet?.rules[0]?.column} ${col.ruleSet?.rules[0]?.relation} "${col.ruleSet?.rules[0]?.condition}"`
    : "NOT FOUND",
});

// 3) AR translation on collection
if (col) {
  const tr = await gql(
    `query($id: ID!) { translatableResource(resourceId: $id) { translations(locale: "ar") { key value } } }`,
    { id: col.id }
  );
  const arTrans = tr.data?.translatableResource?.translations || [];
  const arTitle = arTrans.find((t) => t.key === "title");
  checks.push({
    label: "Collection AR translation",
    ok: !!arTitle?.value,
    detail: arTitle ? `title="${arTitle.value}"` : "NO AR TRANSLATION",
  });
}

// 4) Live storefront returns products
try {
  const sr = await fetch("https://bluemarineatelier.com/collections/bisht-set", {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const html = await sr.text();
  const productMatches = [...html.matchAll(/\/products\/([a-z0-9-]+)/g)];
  const unique = new Set(productMatches.map((m) => m[1]));
  checks.push({
    label: "Live storefront /collections/bisht-set renders products",
    ok: unique.size > 0,
    detail: `${unique.size} unique products on rendered page`,
  });
} catch (e) {
  checks.push({ label: "Live storefront /collections/bisht-set", ok: false, detail: e.message });
}

// 5) Discount auto-apply URL redirects correctly
try {
  const dur = await fetch(
    "https://bluemarineatelier.com/discount/MATCHINGBISHT15?redirect=/collections/bisht-set",
    { headers: { "User-Agent": "Mozilla/5.0" }, redirect: "manual" }
  );
  checks.push({
    label: "Auto-discount URL",
    ok: dur.status === 302 || dur.status === 301,
    detail: `${dur.status} → ${dur.headers.get("location") || "(no redirect)"}`,
  });
} catch (e) {
  checks.push({ label: "Auto-discount URL", ok: false, detail: e.message });
}

// 6) Order confirmation email — has anyone tested it? Check our Liquid file exists
const liquidPath = resolve(__dirname, "..", "..", "shopify-snippets", "order-confirmation-bisht-upsell.liquid");
checks.push({
  label: "Email Liquid block file ready to paste",
  ok: existsSync(liquidPath),
  detail: existsSync(liquidPath) ? liquidPath : "FILE MISSING",
});

// 7) Has Khadija pasted the Liquid? We can't read the email template body via API,
//    but we can check if any recent orders received the modified email.
//    Indirect signal: do any recent daraa orders have the upsell-eligible-bisht tag?
const recentOrders = await gql(
  `{
    orders(first: 20, sortKey: CREATED_AT, reverse: true, query: "created_at:>=2026-05-15") {
      edges {
        node {
          id
          name
          createdAt
          tags
          lineItems(first: 10) { edges { node { product { productType } } } }
        }
      }
    }
  }`
);
const orders = recentOrders.data?.orders?.edges || [];
const daraaOrders = orders.filter((o) =>
  o.node.lineItems.edges.some((l) => /daraa/i.test(l.node.product?.productType || ""))
);
const taggedOrders = daraaOrders.filter((o) =>
  o.node.tags?.includes("upsell-eligible-bisht")
);
checks.push({
  label: "Shopify Flow workflow firing (indirect)",
  ok: daraaOrders.length === 0 ? null : taggedOrders.length > 0,
  detail:
    daraaOrders.length === 0
      ? `No daraa orders in last 24h to test against`
      : `${taggedOrders.length}/${daraaOrders.length} daraa orders have upsell-eligible-bisht tag`,
});

// 8) Email template paste — UNCHECKABLE via API
checks.push({
  label: "Order confirmation email has upsell block pasted",
  ok: null,
  detail: "Cannot verify via API — Shopify does not expose notification body. Send a test order to check.",
});

// 9) SuperLemon automation — UNCHECKABLE via API
checks.push({
  label: "SuperLemon WhatsApp automation configured",
  ok: null,
  detail: "Cannot verify via API — SuperLemon is a third-party app. Send a test order to check.",
});

// Render
console.log("\n══════════ POST-PURCHASE UPSELL AUDIT ══════════\n");
for (const c of checks) {
  const icon = c.ok === true ? "✅" : c.ok === false ? "❌" : "❓";
  console.log(`${icon}  ${c.label}`);
  console.log(`    ${c.detail}\n`);
}

const done = checks.filter((c) => c.ok === true).length;
const failed = checks.filter((c) => c.ok === false).length;
const unknown = checks.filter((c) => c.ok === null).length;
console.log("═════════════════════════════════════════════════");
console.log(`  ${done} done   ${failed} failed   ${unknown} need-manual-check`);
console.log("═════════════════════════════════════════════════");
