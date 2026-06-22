#!/usr/bin/env node
/**
 * One-time backfill: queue WhatsApp review requests for PAST customers.
 *
 * Reads fulfilled Shopify orders, dedupes to one ask per customer (most recent
 * order), and upserts rows into Supabase `pending_review_requests`. The existing
 * /api/cron/process-review-requests cron then drains the queue and sends, so the
 * staggered send_at schedule here doubles as rate-limiting to protect the
 * number's WhatsApp quality rating.
 *
 *   node scripts/backfill-review-requests.mjs            # DRY RUN (no writes)
 *   node scripts/backfill-review-requests.mjs --apply    # insert queue rows
 *
 * Requires: migration 009 applied, templates approved by Meta, cron deployed.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, "..", ".env.local"), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const APPLY = process.argv.includes("--apply");
const STORE = env.SHOPIFY_STORE_URL, TOKEN = env.SHOPIFY_ACCESS_TOKEN, VER = env.SHOPIFY_API_VERSION || "2024-10";

// Stagger config — protects WhatsApp quality rating on a low-history number.
const PER_DAY = Number(env.BACKFILL_PER_DAY || "50");
const WINDOW_HOURS = 8;                 // spread each day's batch across 8h
const START_HOUR_UTC = 7;               // ~10:00 Kuwait (GMT+3)
const startDay = new Date(Date.now() + 24 * 60 * 60 * 1000); // begin tomorrow

function pickPhone(o) {
  return o.customer?.phone || o.shipping_address?.phone || o.billing_address?.phone || null;
}
function pickLocale(o) {
  const c = (o.shipping_address?.country_code || o.billing_address?.country_code || "").toUpperCase();
  return c === "US" ? "en" : "ar";
}
function normPhone(p) { return (p || "").replace(/[^\d]/g, ""); }

async function fetchAllOrders() {
  const out = [];
  let url = `https://${STORE}/admin/api/${VER}/orders.json?status=any&fulfillment_status=shipped&limit=250&fields=id,name,created_at,customer,shipping_address,billing_address,line_items`;
  while (url) {
    const res = await fetch(url, { headers: { "X-Shopify-Access-Token": TOKEN } });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const json = await res.json();
    out.push(...(json.orders || []));
    const link = res.headers.get("link") || "";
    const m = link.match(/<([^>]+)>;\s*rel="next"/);
    url = m ? m[1] : null;
  }
  return out;
}

const orders = await fetchAllOrders();
orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); // newest first

const seen = new Set();
const queue = [];
let noPhone = 0;
for (const o of orders) {
  const phone = pickPhone(o);
  if (!phone) { noPhone++; continue; }
  const key = normPhone(phone);
  if (!key || seen.has(key)) continue;            // one ask per customer
  seen.add(key);
  const firstItem = (o.line_items || []).find((li) => li.product_id);
  queue.push({
    shopify_order_id: String(o.id),
    shopify_order_number: o.name || null,
    customer_first_name: (o.customer?.first_name || "").trim() || null,
    customer_phone: phone,
    customer_locale: pickLocale(o),
    product_id: firstItem?.product_id ? String(firstItem.product_id) : null,
    product_title: firstItem?.title || null,
  });
}

// staggered send_at
function sendAtFor(i) {
  const day = Math.floor(i / PER_DAY);
  const slot = i % PER_DAY;
  const d = new Date(startDay);
  d.setUTCDate(d.getUTCDate() + day);
  d.setUTCHours(START_HOUR_UTC, 0, 0, 0);
  d.setUTCMinutes(Math.round((slot * WINDOW_HOURS * 60) / PER_DAY));
  return d.toISOString();
}
queue.forEach((row, i) => { row.send_at = sendAtFor(i); row.send_status = "pending"; });

const byLocale = queue.reduce((a, r) => ((a[r.customer_locale] = (a[r.customer_locale] || 0) + 1), a), {});
console.log(`Orders scanned (shipped):     ${orders.length}`);
console.log(`Skipped — no phone:           ${noPhone}`);
console.log(`Unique customers to message:  ${queue.length}`);
console.log(`Locale split:                 ${JSON.stringify(byLocale)}`);
console.log(`Schedule:                     ${PER_DAY}/day, first=${queue[0]?.send_at}  last=${queue[queue.length - 1]?.send_at}`);
console.log(`Sample (first 5):`);
for (const r of queue.slice(0, 5)) console.log(`   ${r.shopify_order_number} | ${r.customer_first_name || "(no name)"} | ${r.customer_locale} | ${normPhone(r.customer_phone).replace(/.(?=.{4})/g, "*")} | ${r.product_title || "(no product)"}`);

if (!APPLY) {
  console.log(`\nDRY RUN — no rows written. Re-run with --apply once migration 009 is applied and templates are APPROVED.`);
  process.exit(0);
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
let ok = 0, fail = 0;
for (let i = 0; i < queue.length; i += 100) {
  const batch = queue.slice(i, i + 100);
  const { error } = await supabase.from("pending_review_requests").upsert(batch, { onConflict: "shopify_order_id" });
  if (error) { fail += batch.length; console.error(`  batch ${i}-${i + batch.length} error: ${error.message}`); }
  else ok += batch.length;
}
console.log(`\n✅ Queued ${ok} review requests${fail ? `, ${fail} failed` : ""}. The cron will send them on the staggered schedule.`);
