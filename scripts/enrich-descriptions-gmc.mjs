#!/usr/bin/env node
/**
 * Enrich dress descriptions (EN + AR) with the 4 structured attributes
 * Google Merchant Center asked for on 2026-05-14:
 *   - Color    / اللون
 *   - Size     / المقاس
 *   - Material / مادة الصنع
 *   - Pattern  / النقش
 *
 * Source of truth (in priority order):
 *   1. Variant Color option            → color list
 *   2. Variant Size option              → size range
 *   3. shopify.fabric metaobjects       → material
 *   4. shopify.color-pattern + tags     → pattern (excluding plain colors)
 *
 * The enrichment block is wrapped in an HTML marker comment so re-runs
 * replace the previous block instead of duplicating it.
 *
 * USAGE
 *   node scripts/enrich-descriptions-gmc.mjs --dry --limit 3   # preview only
 *   node scripts/enrich-descriptions-gmc.mjs --apply --limit 3 # apply to 3
 *   node scripts/enrich-descriptions-gmc.mjs --apply           # apply to all
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

const args = process.argv.slice(2);
const DRY = !args.includes("--apply");
const LIMIT = (() => {
  const i = args.indexOf("--limit");
  return i >= 0 ? Number(args[i + 1]) : Infinity;
})();

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

const COLOR_AR = {
  black: "أسود", white: "أبيض", red: "أحمر", blue: "أزرق", "navy": "كحلي",
  "navy blue": "كحلي", green: "أخضر", "dark green": "أخضر داكن",
  "emerald green": "أخضر زمردي", "olive green": "أخضر زيتي",
  "olive yellow": "أصفر زيتي", yellow: "أصفر", "mustard yellow": "أصفر خردلي",
  burgundy: "عنابي", maroon: "عنابي", plum: "بنفسجي داكن",
  purple: "بنفسجي", pink: "وردي", brown: "بني", beige: "بيج",
  "warm beige": "بيج دافئ", gray: "رمادي", grey: "رمادي", gold: "ذهبي",
  silver: "فضي", bronze: "برونزي", orange: "برتقالي",
  "rust orange": "برتقالي صدئ", multicolor: "متعدد الألوان",
  "multi-color": "متعدد الألوان", cream: "كريمي", ivory: "عاجي",
  turquoise: "فيروزي", teal: "أزرق مخضر",
};

const FABRIC_AR = {
  cotton: "قطن",
  silk: "حرير",
  velvet: "مخمل",
  chiffon: "شيفون",
  satin: "ساتان",
  crepe: "كريب",
  georgette: "جورجيت",
  linen: "كتان",
  wool: "صوف",
};

const PATTERN_AR = {
  embroidered: "مطرّز",
  embroidery: "تطريز",
  printed: "مطبوع",
  print: "طبعة",
  floral: "نقش زهور",
  geometric: "نقش هندسي",
  striped: "مخطّط",
  paisley: "نقش بيزلي",
  sequin: "مزيّن بالترتر",
  sequins: "ترتر",
  "blue floral": "نقش زهور أزرق",
  "olive floral": "نقش زهور زيتي",
  "multi patchwork": "ترقيع متعدد الألوان",
  solid: "سادة",
  plain: "سادة",
};

const SOLID_COLOR_HANDLES = new Set([
  "black", "black-1", "white", "red", "blue", "navy", "green", "dark-green",
  "emerald-green", "olive-green", "olive-yellow", "yellow", "mustard-yellow",
  "burgundy", "maroon", "plum", "purple", "pink", "brown", "beige", "warm-beige",
  "gray", "grey", "gold", "silver", "bronze", "orange", "rust-orange", "cream",
  "ivory", "turquoise", "teal",
]);

const arOf = (en, map) => {
  if (!en) return en;
  const key = String(en).toLowerCase().trim();
  return map[key] || en;
};

const MARKER_START = "<!-- gmc-enriched:start -->";
const MARKER_END = "<!-- gmc-enriched:end -->";

function buildEnBlock({ colors, sizes, materials, patterns }) {
  const lines = [];
  if (colors.length) lines.push(`<li><strong>Colors:</strong> ${colors.join(", ")}</li>`);
  if (sizes.length) lines.push(`<li><strong>Sizes:</strong> ${sizes.join(", ")}</li>`);
  if (materials.length) lines.push(`<li><strong>Material:</strong> ${materials.join(", ")}</li>`);
  if (patterns.length) lines.push(`<li><strong>Pattern:</strong> ${patterns.join(", ")}</li>`);
  if (!lines.length) return "";
  return `\n${MARKER_START}\n<h3>Product details</h3>\n<ul>\n${lines.join("\n")}\n</ul>\n${MARKER_END}`;
}

function buildArBlock({ colors, sizes, materials, patterns }) {
  const lines = [];
  const arColors = colors.map((c) => arOf(c, COLOR_AR));
  const arMats = materials.map((m) => arOf(m, FABRIC_AR));
  const arPats = patterns.map((p) => arOf(p, PATTERN_AR));
  if (arColors.length) lines.push(`<li><strong>الألوان:</strong> ${arColors.join("، ")}</li>`);
  if (sizes.length) lines.push(`<li><strong>المقاسات:</strong> ${sizes.join("، ")}</li>`);
  if (arMats.length) lines.push(`<li><strong>مادة الصنع:</strong> ${arMats.join("، ")}</li>`);
  if (arPats.length) lines.push(`<li><strong>النقش:</strong> ${arPats.join("، ")}</li>`);
  if (!lines.length) return "";
  return `\n${MARKER_START}\n<h3>تفاصيل المنتج</h3>\n<ul>\n${lines.join("\n")}\n</ul>\n${MARKER_END}`;
}

function mergeBlock(html, block) {
  const safe = html || "";
  const re = new RegExp(`\\s*${MARKER_START}[\\s\\S]*?${MARKER_END}\\s*`);
  const stripped = safe.replace(re, "");
  return (stripped.trimEnd() + "\n" + block).trim();
}

// ---------- Step 1: resolve metaobjects --------------------------
async function loadMetaobjects(type) {
  const out = {};
  let cursor = null;
  while (true) {
    const d = await gql(
      `query($t:String!,$c:String){
        metaobjects(type:$t, first:100, after:$c){
          pageInfo{hasNextPage endCursor}
          edges{node{ id handle displayName }}
        }
      }`,
      { t: type, c: cursor },
    );
    for (const e of d.metaobjects.edges) out[e.node.id] = { handle: e.node.handle, name: e.node.displayName };
    if (!d.metaobjects.pageInfo.hasNextPage) break;
    cursor = d.metaobjects.pageInfo.endCursor;
  }
  return out;
}
const FABRIC = await loadMetaobjects("shopify--fabric");
const PATTERN_META = await loadMetaobjects("shopify--color-pattern");
console.log(`Loaded ${Object.keys(FABRIC).length} fabrics, ${Object.keys(PATTERN_META).length} color-patterns.`);

// ---------- Step 2: fetch dress products -------------------------
const products = [];
let cursor = null;
const TARGET_TYPES = new Set(["Daraa", "Two-Piece Daraa", "Three-Piece Daraa", "Bisht Set"]);
while (true) {
  const d = await gql(
    `query($c:String){
      products(first:50, after:$c, query:"status:active") {
        pageInfo{hasNextPage endCursor}
        edges{ node {
          id title handle status productType tags descriptionHtml
          options { name values }
          mfFabric: metafield(namespace:"shopify", key:"fabric") { value }
          mfPattern: metafield(namespace:"shopify", key:"color-pattern") { value }
        } }
      }
    }`,
    { c: cursor },
  );
  for (const e of d.products.edges) {
    if (TARGET_TYPES.has(e.node.productType)) products.push(e.node);
  }
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}
console.log(`Active dress products: ${products.length}`);

// ---------- Step 3: build enrichment payloads --------------------
function extractAttrs(p) {
  const opts = Object.fromEntries((p.options || []).map((o) => [o.name.toLowerCase(), o.values]));

  // Colors from Color variant option, or fall back to solid entries
  // in the shopify.color-pattern metaobject (for single-color products).
  const colorOptionVals = (opts["color"] || []).filter(Boolean);
  const patternIdsForColor = JSON.parse(p.mfPattern?.value || "[]");
  const solidFromMeta = patternIdsForColor
    .map((id) => PATTERN_META[id])
    .filter((m) => m && SOLID_COLOR_HANDLES.has(m.handle))
    .map((m) => m.name);
  const colors = colorOptionVals.length ? colorOptionVals : solidFromMeta;

  // Sizes from Size option — show as range if monotonic
  const sizeOrder = ["3XS", "2XS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];
  const rawSizes = opts["size"] || [];
  const sorted = [...rawSizes].sort((a, b) => sizeOrder.indexOf(a) - sizeOrder.indexOf(b));
  const sizes = sorted.length >= 3 ? [`${sorted[0]} – ${sorted[sorted.length - 1]}`] : sorted;

  // Material from shopify.fabric metaobject IDs
  const fabricIds = JSON.parse(p.mfFabric?.value || "[]");
  const materials = fabricIds.map((id) => FABRIC[id]?.name).filter(Boolean);

  // Pattern — combine shopify.color-pattern (non-solid only) + tag signals
  const patternIds = JSON.parse(p.mfPattern?.value || "[]");
  const patternFromMeta = patternIds
    .map((id) => PATTERN_META[id])
    .filter((m) => m && !SOLID_COLOR_HANDLES.has(m.handle))
    .map((m) => m.name);

  const tagSet = new Set((p.tags || []).map((t) => t.toLowerCase()));
  const patternFromTags = [];
  if (tagSet.has("embroidered") || tagSet.has("embroidery")) patternFromTags.push("Embroidered");
  if (tagSet.has("printed") || tagSet.has("print")) patternFromTags.push("Printed");
  if (tagSet.has("sequin") || tagSet.has("sequins")) patternFromTags.push("Sequin");
  if (tagSet.has("floral") && !patternFromMeta.some((x) => /floral/i.test(x))) patternFromTags.push("Floral");
  if (tagSet.has("geometric") && !patternFromMeta.some((x) => /geometric/i.test(x))) patternFromTags.push("Geometric");

  const seen = new Set();
  const patterns = [...patternFromMeta, ...patternFromTags].filter((p) => {
    const k = p.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Fallback: solid if we have a Color option but nothing pattern-y
  if (!patterns.length && colors.length) patterns.push("Solid");

  return { colors, sizes, materials, patterns };
}

const decisions = [];
for (const p of products) {
  const attrs = extractAttrs(p);
  decisions.push({ ...p, ...attrs });
}

// ---------- Step 4: dry-run summary -----------------------------
console.log("\n--- Sample previews ---");
for (const d of decisions.slice(0, 3)) {
  console.log(`\n● ${d.title}`);
  console.log("  EN block:");
  console.log(buildEnBlock(d).replace(/^/gm, "    "));
  console.log("  AR block:");
  console.log(buildArBlock(d).replace(/^/gm, "    "));
}

if (DRY) {
  console.log(`\n[DRY] Would enrich ${decisions.length} products. Re-run with --apply to push.`);
  process.exit(0);
}

// ---------- Step 5: apply --------------------------------------
const PRODUCT_UPDATE = `mutation($p: ProductInput!) {
  productUpdate(input: $p) {
    product { id }
    userErrors { field message }
  }
}`;
const TR_REG = `mutation($id:ID!, $t:[TranslationInput!]!){
  translationsRegister(resourceId:$id, translations:$t){
    translations { key }
    userErrors { field message }
  }
}`;
const TR_FETCH = `query($id:ID!){
  translatableResource(resourceId:$id){
    translatableContent { key value digest }
  }
}`;

let applied = 0;
let errors = 0;
const log = [];
const slice = decisions.slice(0, LIMIT);
for (const d of slice) {
  try {
    // EN: update descriptionHtml
    const enBlock = buildEnBlock(d);
    const newHtml = mergeBlock(d.descriptionHtml, enBlock);
    if (newHtml !== d.descriptionHtml) {
      const r = await gql(PRODUCT_UPDATE, { p: { id: d.id, descriptionHtml: newHtml } });
      const e = r.productUpdate.userErrors;
      if (e.length) throw new Error("EN: " + JSON.stringify(e));
    }

    // AR: re-fetch digests, merge, register
    const tr = await gql(TR_FETCH, { id: d.id });
    const enMap = Object.fromEntries(
      (tr.translatableResource?.translatableContent || []).map((c) => [c.key, c]),
    );
    const arBlock = buildArBlock(d);
    const arBodyCurrent =
      (await gql(`query($id:ID!){ translatableResource(resourceId:$id){ translations(locale:"ar"){key value} } }`, { id: d.id }))
        .translatableResource?.translations?.find((x) => x.key === "body_html")?.value || "";
    const newArHtml = mergeBlock(arBodyCurrent, arBlock);
    const digest = enMap["body_html"]?.digest;
    if (digest && newArHtml && newArHtml !== arBodyCurrent) {
      const r = await gql(TR_REG, {
        id: d.id,
        t: [{ locale: "ar", key: "body_html", value: newArHtml, translatableContentDigest: digest }],
      });
      const e = r.translationsRegister.userErrors;
      if (e.length) throw new Error("AR: " + JSON.stringify(e));
    }

    applied++;
    log.push({ handle: d.handle, title: d.title, ok: true });
    console.log(`✓ ${d.handle}`);
  } catch (err) {
    errors++;
    log.push({ handle: d.handle, title: d.title, ok: false, error: String(err) });
    console.log(`✗ ${d.handle}: ${err}`);
  }
}

writeFileSync(resolve(__dirname, "..", "enrich-descriptions-gmc.log.json"), JSON.stringify(log, null, 2));
console.log(`\nApplied ${applied}  |  Errors ${errors}  |  Log: enrich-descriptions-gmc.log.json`);
