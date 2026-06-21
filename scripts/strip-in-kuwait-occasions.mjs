#!/usr/bin/env node
/**
 * Remove the occasion-phrase " in Kuwait" / " في الكويت" from product
 * descriptions (EN + AR). Provenance mentions like "atelier-made in Kuwait",
 * "Atelier Blue Marine crafts each piece in Kuwait", "صُنع في الكويت" are
 * KEPT — only occasion endings (gatherings/evenings/weddings/occasions/
 * celebrations/dinners/receptions/nights/parties in Kuwait) are stripped.
 *
 *   node scripts/strip-in-kuwait-occasions.mjs --dry              # preview, no writes
 *   node scripts/strip-in-kuwait-occasions.mjs --dry --limit 3    # preview 3 only
 *   node scripts/strip-in-kuwait-occasions.mjs --apply             # write to Shopify
 *   node scripts/strip-in-kuwait-occasions.mjs --apply --limit 3   # apply to 3 only
 *
 * Both EN (descriptionHtml) and AR (translations body_html) are updated.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const URL_ = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${process.env.SHOPIFY_API_VERSION || "2024-10"}/graphql.json`;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const DRY = !APPLY;
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

// --- EN cleanup -----------------------------------------------------------
// Occasion nouns that, when followed by "in Kuwait", indicate occasion-framing
// rather than provenance. We strip ONLY the trailing " in Kuwait" so the
// surrounding sentence stays intact.
const EN_OCCASIONS = "gatherings?|evenings?|weddings?|events?|occasions?|celebrations?|dinners?|receptions?|nights?|parties|festivities|reunions?";
const EN_RE = new RegExp(`(\\b(?:${EN_OCCASIONS}))\\s+in\\s+Kuwait\\b`, "gi");

// Provenance markers we MUST NOT touch (defensive check on the local window).
const EN_PROVENANCE = /(atelier|crafted|made|designed|tailored|sewn|stitched|hand[- ]?finished|hand[- ]?made|Atelier Blue Marine)\b[^.]{0,80}$/i;

function cleanEn(html) {
  if (!html) return { html, changed: 0 };
  let changed = 0;
  const out = html.replace(EN_RE, (full, occ, offset, src) => {
    const window = src.slice(Math.max(0, offset - 90), offset);
    if (EN_PROVENANCE.test(window)) return full;
    changed++;
    return occ;
  });
  return { html: out, changed };
}

// --- AR cleanup -----------------------------------------------------------
// Occasion nouns in AR (with optional definite article + optional adjective)
// that, when ultimately followed by "في الكويت", mean occasion-framing.
// We strip " في الكويت" (and the preceding space) and keep the noun intact.
const AR_OCCASIONS = "(?:ال)?(?:تجمّعات|تجمعات|سهرات|أعراس|مناسبات|مناسبة|حفلات|ليالي|أمسيات|احتفالات|أعياد|سهرة|أمسية|حفلة|مناسبات|تجمع)";
// Optional adjective(s) immediately after the noun before "في الكويت"
const AR_ADJ = "(?:\\s+(?:ال)?(?:عائلية|الخاصة|خاصة|رسمية|الرسمية|الكبرى|العيد|الأعياد|الكبيرة|الصغيرة|الراقية|راقية|عائلية|أنيقة))*";
const AR_RE = new RegExp(`(${AR_OCCASIONS}${AR_ADJ})\\s+في\\s+الكويت`, "g");

// AR provenance signals to defensively avoid touching
const AR_PROVENANCE = /(أتيليه|صنع|صُنع|مصنوع|مصنوعة|يُصنع|يصنع|تُخاط|تخاط|من أتيليه|بلو مارين)/;

// Fallback: standalone " في الكويت" with no provenance signal in the window.
// Catches edge phrasings the AR_RE doesn't (e.g. occasion + non-listed adjective,
// "comfort in Kuwait", "wedding in Kuwait" with different connective).
const AR_FALLBACK_RE = /\s*في\s+الكويت/g;

function cleanAr(html) {
  if (!html) return { html, changed: 0 };
  let changed = 0;
  // Pass 1: targeted occasion-noun regex
  let out = html.replace(AR_RE, (full, noun, offset, src) => {
    const window = src.slice(Math.max(0, offset - 90), offset);
    if (AR_PROVENANCE.test(window)) return full;
    changed++;
    return noun;
  });
  // Pass 2: any remaining " في الكويت" with no provenance marker in window
  out = out.replace(AR_FALLBACK_RE, (full, offset, src) => {
    const window = src.slice(Math.max(0, offset - 90), offset);
    if (AR_PROVENANCE.test(window)) return full;
    changed++;
    return "";
  });
  return { html: out, changed };
}

// --- Shopify ops ----------------------------------------------------------

const Q_PRODUCTS = `
  query Products($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        title
        descriptionHtml
        translations(locale: "ar") { key value locale }
      }
    }
  }
`;

const Q_TRANSLATABLE = `
  query Translatable($id: ID!) {
    translatableResource(resourceId: $id) {
      translatableContent { key value locale digest type }
    }
  }
`;

const M_UPDATE = `
  mutation ProductUpdate($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id }
      userErrors { field message }
    }
  }
`;

const M_TRANSLATE = `
  mutation Register($resourceId: ID!, $translations: [TranslationInput!]!) {
    translationsRegister(resourceId: $resourceId, translations: $translations) {
      translations { key value locale }
      userErrors { field message }
    }
  }
`;

async function getArDigest(productId) {
  const data = await gql(Q_TRANSLATABLE, { id: productId });
  const c = data.translatableResource.translatableContent.find(c => c.key === "body_html");
  return c ? c.digest : null;
}

async function main() {
  let cursor = null;
  let scanned = 0;
  let touched = 0;
  let enFixed = 0;
  let arFixed = 0;
  const sampleDiffs = [];

  while (true) {
    const data = await gql(Q_PRODUCTS, { cursor });
    for (const p of data.products.nodes) {
      if (scanned >= LIMIT) break;
      scanned++;

      const enOld = p.descriptionHtml || "";
      const arOld = (p.translations.find(t => t.key === "body_html") || {}).value || "";

      const { html: enNew, changed: enChanges } = cleanEn(enOld);
      const { html: arNew, changed: arChanges } = cleanAr(arOld);

      if (enChanges === 0 && arChanges === 0) continue;

      touched++;
      enFixed += enChanges;
      arFixed += arChanges;

      if (sampleDiffs.length < 3) {
        sampleDiffs.push({
          handle: p.handle, title: p.title, enChanges, arChanges,
          enBefore: enOld, enAfter: enNew, arBefore: arOld, arAfter: arNew,
        });
      }

      if (APPLY) {
        if (enChanges > 0) {
          const res = await gql(M_UPDATE, { product: { id: p.id, descriptionHtml: enNew } });
          if (res.productUpdate.userErrors?.length) {
            console.error(`  EN ERROR [${p.handle}]:`, res.productUpdate.userErrors);
          }
        }
        if (arChanges > 0 && arOld) {
          const digest = await getArDigest(p.id);
          if (!digest) {
            console.error(`  AR ERROR [${p.handle}]: no body_html digest`);
          } else {
            const res = await gql(M_TRANSLATE, {
              resourceId: p.id,
              translations: [{
                locale: "ar", key: "body_html", value: arNew,
                translatableContentDigest: digest,
              }],
            });
            if (res.translationsRegister.userErrors?.length) {
              console.error(`  AR ERROR [${p.handle}]:`, res.translationsRegister.userErrors);
            }
          }
        }
        process.stdout.write(`  ${APPLY ? "✓" : "·"} ${p.handle} (EN:${enChanges} AR:${arChanges})\n`);
      }
    }
    if (scanned >= LIMIT || !data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }

  console.log("");
  console.log(`Mode:   ${APPLY ? "APPLY" : "DRY-RUN (no writes)"}`);
  console.log(`Scanned: ${scanned} products`);
  console.log(`Touched: ${touched} products`);
  console.log(`Strips:  EN=${enFixed}  AR=${arFixed}`);
  console.log("");
  for (const ex of sampleDiffs) {
    console.log(`── ${ex.handle} | ${ex.title} (EN:${ex.enChanges} AR:${ex.arChanges})`);
    if (ex.enChanges > 0) {
      const findCtx = (s) => {
        const i = s.indexOf("in Kuwait");
        return i >= 0 ? s.slice(Math.max(0, i - 80), i + 90) : "";
      };
      console.log(`  EN before: …${findCtx(ex.enBefore).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")}…`);
      // pick the same anchor word to show after
      const anchor = ex.enBefore.match(EN_RE)?.[0] || "";
      const stripped = anchor.replace(/\s+in\s+Kuwait/i, "");
      const i2 = stripped ? ex.enAfter.indexOf(stripped) : -1;
      if (i2 >= 0) console.log(`  EN after:  …${ex.enAfter.slice(Math.max(0, i2 - 80), i2 + 90).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")}…`);
    }
    if (ex.arChanges > 0) {
      const i = ex.arBefore.indexOf("في الكويت");
      if (i >= 0) console.log(`  AR before: …${ex.arBefore.slice(Math.max(0, i - 70), i + 80).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")}…`);
      const m = ex.arBefore.match(AR_RE)?.[0] || "";
      const arStripped = m.replace(/\s+في\s+الكويت/, "");
      const i2 = arStripped ? ex.arAfter.indexOf(arStripped) : -1;
      if (i2 >= 0) console.log(`  AR after:  …${ex.arAfter.slice(Math.max(0, i2 - 70), i2 + 80).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")}…`);
    }
    console.log("");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
