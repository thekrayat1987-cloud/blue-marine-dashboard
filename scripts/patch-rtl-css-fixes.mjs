#!/usr/bin/env node
/**
 * Two RTL CSS fixes:
 * 1) sorting.liquid — change sortdrop popover RTL anchor selector from
 *    [dir="rtl"] (page has no dir attribute) to :lang(ar).
 * 2) price-filter.liquid — switch to logical properties so the currency
 *    label sits on the correct side and doesn't overlap the typed value
 *    on narrow mobile inputs.
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
const REST = `https://${STORE}/admin/api/${VERSION}/themes/182480240940/assets.json`;

async function get(key) {
  const r = await fetch(REST + "?asset[key]=" + encodeURIComponent(key), {
    headers: { "X-Shopify-Access-Token": TOKEN },
  });
  return (await r.json()).asset?.value;
}
async function put(key, value) {
  const r = await fetch(REST, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ asset: { key, value } }),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error(JSON.stringify(j).slice(0, 400));
  return j;
}

// ---------- 1) sorting.liquid ----------
{
  const KEY = "snippets/sorting.liquid";
  const orig = await get(KEY);
  if (!orig) throw new Error(`Could not fetch ${KEY}`);
  writeFileSync(resolve(__dirname, "..", "sorting.liquid.bak2"), orig);

  let next = orig;
  const oldRule = `[dir="rtl"] .sorting-filter__options {
    right: unset;
    left: 0;
  }`;
  const newRule = `:lang(ar) .sorting-filter__options {
    right: unset;
    left: 0;
  }`;
  if (next.includes(oldRule)) {
    next = next.replace(oldRule, newRule);
    console.log("✏️  sorting.liquid: swapped [dir=rtl] → :lang(ar)");
  } else if (!next.includes(":lang(ar) .sorting-filter__options")) {
    // not present — append the new rule before {% endstylesheet %}
    next = next.replace(
      "{% endstylesheet %}",
      `  /* RTL popover overflow fix */\n  ${newRule}\n{% endstylesheet %}`,
    );
    console.log("✏️  sorting.liquid: injected :lang(ar) rule");
  } else {
    console.log("⏭  sorting.liquid: already has :lang(ar) rule");
  }
  if (next !== orig) {
    await put(KEY, next);
    console.log(`✅ sorting.liquid updated (${next.length} chars)`);
  }
}

// ---------- 2) price-filter.liquid ----------
{
  const KEY = "snippets/price-filter.liquid";
  const orig = await get(KEY);
  if (!orig) throw new Error(`Could not fetch ${KEY}`);
  writeFileSync(resolve(__dirname, "..", "price-filter.liquid.bak"), orig);

  let next = orig;

  // Swap to logical properties + add a generous mobile padding override
  const oldInputCss = `  .price-facet__input {
    width: 100%;
    text-align: right;
    padding-left: calc(2.5 * var(--input-padding-x));
  }`;
  const newInputCss = `  .price-facet__input {
    width: 100%;
    text-align: end;
    padding-inline-start: calc(3.5 * var(--input-padding-x));
    padding-inline-end: var(--input-padding-x);
  }`;

  const oldLabelCss = `  .field__label.price-facet__label {
    top: 0;
    left: 0;
    color: var(--facets-input-label-color);
    padding: var(--input-padding-y) var(--input-padding-x);
    transform: none;
  }`;
  const newLabelCss = `  .field__label.price-facet__label {
    top: 0;
    inset-inline-start: 0;
    color: var(--facets-input-label-color);
    padding: var(--input-padding-y) var(--input-padding-x);
    transform: none;
    pointer-events: none;
  }`;

  if (next.includes(oldInputCss)) {
    next = next.replace(oldInputCss, newInputCss);
    console.log("✏️  price-filter.liquid: input — physical → logical props");
  } else {
    console.log("⏭  price-filter.liquid: input rule not found in expected form");
  }
  if (next.includes(oldLabelCss)) {
    next = next.replace(oldLabelCss, newLabelCss);
    console.log("✏️  price-filter.liquid: label — left → inset-inline-start");
  } else {
    console.log("⏭  price-filter.liquid: label rule not found in expected form");
  }

  if (next !== orig) {
    await put(KEY, next);
    console.log(`✅ price-filter.liquid updated (${next.length} chars)`);
  }
}

// Bust cache
const tl = await get("layout/theme.liquid");
const stamped = tl.replace(/<!-- locale-bust:[0-9]+ -->\n?/g, "");
await put("layout/theme.liquid", `<!-- locale-bust:${Date.now()} -->\n${stamped}`);
console.log("✅ theme.liquid touched");
