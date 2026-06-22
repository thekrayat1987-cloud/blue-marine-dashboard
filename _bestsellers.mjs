#!/usr/bin/env node
// Bestsellers report: aggregates real units sold + revenue from Shopify orders.
import fs from 'node:fs';
const env = Object.fromEntries(
  fs.readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const STORE = env.SHOPIFY_STORE_URL, TOKEN = env.SHOPIFY_ACCESS_TOKEN, VER = env.SHOPIFY_API_VERSION || '2024-10';
const base = `https://${STORE}/admin/api/${VER}`;
const headers = { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' };
async function gql(q, v = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(`${base}/graphql.json`, { method: 'POST', headers, body: JSON.stringify({ query: q, variables: v }) });
    const j = await r.json();
    if (j.errors && JSON.stringify(j.errors).includes('THROTTLED')) { await new Promise(s => setTimeout(s, 1500)); continue; }
    if (j.errors) throw new Error('GQL: ' + JSON.stringify(j.errors));
    return j.data;
  }
  throw new Error('throttled out');
}

const DAYS = parseInt(process.argv[2] || '90', 10);
const since = new Date(Date.now() - DAYS * 864e5).toISOString().slice(0, 10);
const queryStr = `created_at:>=${since}`;

const q = `query($cursor:String,$query:String!){
  orders(first:100, after:$cursor, query:$query){
    pageInfo{ hasNextPage endCursor }
    edges{ node{
      id
      lineItems(first:50){ edges{ node{
        quantity
        title
        product{ id title }
        originalTotalSet{ shopMoney{ amount currencyCode } }
        discountedTotalSet{ shopMoney{ amount currencyCode } }
      } } }
    } }
  }
}`;

const stats = new Map(); // productId -> {title, units, revenue}
let cursor = null, orderCount = 0, currency = 'KWD', pages = 0;
process.stderr.write(`Pulling orders since ${since} (last ${DAYS} days)...\n`);
do {
  const d = await gql(q, { cursor, query: queryStr });
  const conn = d.orders;
  pages++;
  for (const { node: o } of conn.edges) {
    orderCount++;
    for (const { node: li } of o.lineItems.edges) {
      const key = li.product?.id || `__deleted__${li.title}`;
      const title = li.product?.title || li.title || '(deleted product)';
      const rev = parseFloat(li.discountedTotalSet?.shopMoney?.amount ?? li.originalTotalSet?.shopMoney?.amount ?? '0');
      currency = li.discountedTotalSet?.shopMoney?.currencyCode || currency;
      const s = stats.get(key) || { title, units: 0, revenue: 0 };
      s.units += li.quantity;
      s.revenue += rev;
      stats.set(key, s);
    }
  }
  cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
  if (pages % 5 === 0) process.stderr.write(`  ...${orderCount} orders so far\n`);
} while (cursor);

const rows = [...stats.values()];
const byUnits = [...rows].sort((a, b) => b.units - a.units).slice(0, 20);
const byRev = [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 20);
const totalUnits = rows.reduce((s, r) => s + r.units, 0);
const totalRev = rows.reduce((s, r) => s + r.revenue, 0);

const pad = (s, n) => String(s).slice(0, n).padEnd(n);
console.log(`\n=== BLUE MARINE BESTSELLERS — last ${DAYS} days (since ${since}) ===`);
console.log(`Orders: ${orderCount}  |  Total units sold: ${totalUnits}  |  Total revenue: ${totalRev.toFixed(3)} ${currency}\n`);

console.log(`TOP 20 BY UNITS SOLD`);
console.log(`  #  ${pad('Product', 44)} Units   Revenue`);
byUnits.forEach((r, i) => console.log(`  ${String(i + 1).padStart(2)} ${pad(r.title, 44)} ${String(r.units).padStart(5)}   ${r.revenue.toFixed(3)} ${currency}`));

console.log(`\nTOP 20 BY REVENUE (${currency})`);
console.log(`  #  ${pad('Product', 44)} Units   Revenue`);
byRev.forEach((r, i) => console.log(`  ${String(i + 1).padStart(2)} ${pad(r.title, 44)} ${String(r.units).padStart(5)}   ${r.revenue.toFixed(3)} ${currency}`));

if (orderCount === 0) console.log(`\n(No orders in this window. Try a longer range, e.g. node _bestsellers.mjs 365)`);
