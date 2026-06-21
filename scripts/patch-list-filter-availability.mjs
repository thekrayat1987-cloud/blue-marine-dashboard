#!/usr/bin/env node
/**
 * Patch snippets/list-filter.liquid so the built-in Shopify Availability
 * filter values "In stock" / "Out of stock" go through the theme locale
 * (translated to متوفر / غير متوفر in Arabic).
 *
 * Strategy: introduce a Liquid `display_label` variable inside the values
 * for-loop. For the availability filter, override with `'content.inventory_in_stock' | t`
 * (or `_out_of_stock`). For all other filters, fall through to value.label.
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
const KEY = "snippets/list-filter.liquid";

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

const orig = await get(KEY);
if (!orig) throw new Error(`Could not fetch ${KEY}`);

// Backup
writeFileSync(resolve(__dirname, "..", "list-filter.liquid.bak"), orig);

// Idempotency: if we already injected, skip
if (orig.includes("assign display_label")) {
  console.log("⏭  Already patched (display_label found). Re-applying remaining swaps anyway.");
}

let next = orig;

// 1) Inject the display_label assign inside the per-value liquid block.
//    Anchor: the per-iteration block that ends with `endif` for hidden_class.
const anchor = `              {% liquid
                assign input_id = 'Filter-' | append: filter.param_name | escape | append: '-' | append: forloop.index | replace: '.', '-' | append: '-' | append: filter_style | append: '-' | append: in_drawer
                assign is_disabled = false
                if value.count == 0 and value.active == false
                  assign is_disabled = true
                endif
                assign hidden_class = null
                if forloop.index > inital_visible_values and render_show_more
                  assign hidden_class = 'hidden'
                  if filter_style == 'horizontal'
                    assign hidden_class = 'mobile:hidden'
                  endif
                endif
              %}`;

if (!next.includes(anchor)) {
  throw new Error("Anchor block not found — snippet may have changed.");
}

const replacement = `              {% liquid
                assign input_id = 'Filter-' | append: filter.param_name | escape | append: '-' | append: forloop.index | replace: '.', '-' | append: '-' | append: filter_style | append: '-' | append: in_drawer
                assign is_disabled = false
                if value.count == 0 and value.active == false
                  assign is_disabled = true
                endif
                assign hidden_class = null
                if forloop.index > inital_visible_values and render_show_more
                  assign hidden_class = 'hidden'
                  if filter_style == 'horizontal'
                    assign hidden_class = 'mobile:hidden'
                  endif
                endif
                # Translate built-in Shopify Availability filter values via theme locale
                assign display_label = value.label
                if filter.param_name == 'filter.v.availability'
                  if value.value == '1'
                    assign display_label = 'content.inventory_in_stock' | t
                  elsif value.value == '0'
                    assign display_label = 'content.inventory_out_of_stock' | t
                  endif
                endif
              %}`;

if (!next.includes("assign display_label = value.label")) {
  next = next.replace(anchor, replacement);
}

// 2) Swap value.label → display_label in the visible label / aria-label / data-label spots.
const swaps = [
  // image fieldset aria-label
  [`<fieldset
                    class="variant-option variant-option--buttons variant-option--images"
                    aria-label="{{ value.label }}"`, `<fieldset
                    class="variant-option variant-option--buttons variant-option--images"
                    aria-label="{{ display_label }}"`],
  // image input aria-label
  [`                      type="checkbox"
                      name="{{ value.param_name }}"
                      value="{{ value.value }}"
                      aria-label="{{ value.label }}"
                      id="{{ input_id }}"
                      {% if value.active %}
                        checked
                      {% endif %}
                      {% if is_disabled %}
                        disabled
                      {% endif %}
                      ref="facetInputs[]"
                    >
                    <label
                      class="facets__image-label"
                      for="{{ input_id }}"
                      tabindex="-1"
                    >
                      {{- value.label }}
                    </label>`, `                      type="checkbox"
                      name="{{ value.param_name }}"
                      value="{{ value.value }}"
                      aria-label="{{ display_label }}"
                      id="{{ input_id }}"
                      {% if value.active %}
                        checked
                      {% endif %}
                      {% if is_disabled %}
                        disabled
                      {% endif %}
                      ref="facetInputs[]"
                    >
                    <label
                      class="facets__image-label"
                      for="{{ input_id }}"
                      tabindex="-1"
                    >
                      {{- display_label }}
                    </label>`],
  // swatch fieldset aria-label
  [`<fieldset
                    class="variant-option variant-option--buttons variant-option--swatches {% if is_disabled %}variant-option--swatches-disabled{% endif %}"
                    aria-label="{{ value.label }}"`, `<fieldset
                    class="variant-option variant-option--buttons variant-option--swatches {% if is_disabled %}variant-option--swatches-disabled{% endif %}"
                    aria-label="{{ display_label }}"`],
  // swatch input aria-label
  [`                          type="checkbox"
                          name="{{ value.param_name }}"
                          value="{{ value.value }}"
                          aria-label="{{ value.label }}"
                          id="{{ input_id }}"`, `                          type="checkbox"
                          name="{{ value.param_name }}"
                          value="{{ value.value }}"
                          aria-label="{{ display_label }}"
                          id="{{ input_id }}"`],
  // swatch label content
  [`                      <label
                        class="{% if show_swatch_label %}facets__swatch-label{% else %}hidden{% endif %}"
                        for="{{ input_id }}"
                        tabindex="-1"
                      >
                        {{- value.label }}
                      </label>`, `                      <label
                        class="{% if show_swatch_label %}facets__swatch-label{% else %}hidden{% endif %}"
                        for="{{ input_id }}"
                        tabindex="-1"
                      >
                        {{- display_label }}
                      </label>`],
  // pill input data-label
  [`                      <input
                        type="checkbox"
                        name="{{ value.param_name }}"
                        value="{{ value.value }}"
                        id="{{ input_id }}"
                        class="facets__pill-input"
                        data-label="{{ value.label }}"`, `                      <input
                        type="checkbox"
                        name="{{ value.param_name }}"
                        value="{{ value.value }}"
                        id="{{ input_id }}"
                        class="facets__pill-input"
                        data-label="{{ display_label }}"`],
  // pill label content
  [`                      <label
                        class="facets__pill-label"
                        for="{{ input_id }}"
                        tabindex="0"
                      >
                        {{- value.label }}`, `                      <label
                        class="facets__pill-label"
                        for="{{ input_id }}"
                        tabindex="0"
                      >
                        {{- display_label }}`],
  // checkbox render label arg
  [`                    {% render 'checkbox',
                      name: value.param_name,
                      value: value.value,
                      label: value.label,
                      checked: value.active,
                      id: input_id,
                      disabled: is_disabled,
                      inputRef: 'facetInputs[]',
                      events: 'on:pointerenter="/prefetchPage" on:pointerleave="/cancelPrefetchPage"'
                    %}`, `                    {% render 'checkbox',
                      name: value.param_name,
                      value: value.value,
                      label: display_label,
                      checked: value.active,
                      id: input_id,
                      disabled: is_disabled,
                      inputRef: 'facetInputs[]',
                      events: 'on:pointerenter="/prefetchPage" on:pointerleave="/cancelPrefetchPage"'
                    %}`],
];

let appliedSwaps = 0;
for (const [from, to] of swaps) {
  if (next.includes(from)) {
    next = next.replace(from, to);
    appliedSwaps++;
  }
}
console.log(`✏️  Applied ${appliedSwaps}/${swaps.length} value.label → display_label swaps`);

if (next === orig) {
  console.log("⚠️  No changes detected. Aborting PUT.");
  process.exit(0);
}

console.log(`📦 PUT updated ${KEY} (${next.length} chars vs ${orig.length} original)…`);
await put(KEY, next);
console.log("✅ list-filter.liquid patched");

// Bust page cache
console.log("🔄 Touching layout/theme.liquid to bust page cache…");
const tl = await get("layout/theme.liquid");
const stamped = tl.replace(/<!-- locale-bust:[0-9]+ -->\n?/g, "");
await put("layout/theme.liquid", `<!-- locale-bust:${Date.now()} -->\n${stamped}`);
console.log("✅ theme.liquid touched");
