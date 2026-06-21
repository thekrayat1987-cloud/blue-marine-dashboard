// Read dedupe-mapping.json (overrides + manuals) and produce final EN/AR rename
// proposals for the 17 duplicate-title groups.
//
// Usage:
//   node --env-file=.env.local scripts/apply-dedupe-titles.mjs           # dry-run table
//   node --env-file=.env.local scripts/apply-dedupe-titles.mjs --apply   # write to Shopify
//
// On apply, this updates: title (EN), seo.title, seo.description (when current
// SEO echoes the old title), translations (title, meta_title, meta_description).
// Handles are NOT changed — Shopify's auto-redirect would handle 301s but we
// keep current handles to avoid breaking external links.

import { readFile } from "node:fs/promises";

const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
if (!STORE || !TOKEN) { console.error("Missing env"); process.exit(1); }
const APPLY = process.argv.includes("--apply");
const ENDPOINT = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

async function gql(q, v) {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query: q, variables: v }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

// Color/descriptor vocabulary (EN word → AR [masculine, feminine])
const VOCAB = {
  black:    ["أسود",   "سوداء"],
  navy:     ["كحلي",   "كحلية"],
  red:      ["أحمر",   "حمراء"],
  crimson:  ["قرمزي",  "قرمزية"],
  burgundy: ["عنابي",  "عنابية"],
  emerald:  ["زمردي",  "زمردية"],
  green:    ["أخضر",   "خضراء"],
  blue:     ["أزرق",   "زرقاء"],
  teal:     ["أزرق مخضر", "زرقاء مخضرة"],
  white:    ["أبيض",   "بيضاء"],
  beige:    ["بيج",    "بيج"],
  pink:     ["وردي",   "وردية"],
  rose:     ["زهري",   "زهرية"],
  gold:     ["ذهبي",   "ذهبية"],
  silver:   ["فضي",    "فضية"],
  brown:    ["بني",    "بنية"],
  ivory:    ["عاجي",   "عاجية"],
  taupe:    ["رمادي بني", "رمادية بنية"],
  champagne:["شامبني", "شامبني"],
  sand:     ["رملي",   "رملية"],
  yellow:   ["أصفر",   "صفراء"],
  mustard:  ["خردلي",  "خردلية"],
  lilac:    ["ليلكي",  "ليلكية"],
  // Descriptors (multi-word in EN handles)
  embroidered:     ["مطرّز",        "مطرّزة"],
  printed:         ["مطبوع",        "مطبوعة"],
  floral:          ["بأزهار",       "بأزهار"],
  "autumn-leaves": ["بأوراق الخريف", "بأوراق الخريف"],
};

function prettyEn(s) {
  return s.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
function arGender(arTitle) {
  return /درّاعة|دراعة|عباية/.test(arTitle) ? "f" : "m";
}
function insertEn(title, modifier) {
  const pretty = prettyEn(modifier);
  return title.replace(/^([A-Z]\d+\s*[–-]\s*\S+)\s+/, `$1 ${pretty} `);
}
function appendAr(arTitle, modifier) {
  const pair = VOCAB[modifier];
  if (!pair) return null;
  const arWord = pair[arGender(arTitle) === "f" ? 1 : 0];
  return `${arTitle.trimEnd()} ${arWord}`;
}
function stripSku(t) { return t.replace(/^[A-Z]\d+\s*[–-]\s*/, "").trim(); }

// ─────────────────────────────────────────────────────────────────────────────
// 1. Load mapping
// ─────────────────────────────────────────────────────────────────────────────
const mapping = JSON.parse(
  await readFile(new URL("../dedupe-mapping.json", import.meta.url), "utf8"),
);
const overrideBySku = Object.fromEntries(
  mapping.overrides_for_auto_resolved.map((o) => [o.sku, o.modifier]),
);
const manualBySku = Object.fromEntries(
  mapping.manuals.map((m) => [m.sku, m.modifier]),
);

// 2. Find all duplicate-title groups (so we know which products to rename)
console.log("Fetching products…");
const allProducts = [];
let cursor = null;
while (true) {
  const d = await gql(
    `query($c: String) {
      products(first: 100, after: $c, sortKey: TITLE) {
        pageInfo { hasNextPage endCursor }
        edges { node {
          id title handle
          seo { title description }
          options { name values }
        } }
      }
    }`,
    { c: cursor },
  );
  for (const e of d.products.edges) allProducts.push(e.node);
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}
const groups = new Map();
for (const p of allProducts) {
  const k = stripSku(p.title).toLowerCase();
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(p);
}
const dupGroups = [...groups.entries()].filter(([, items]) => items.length > 1);

// 3. Determine modifier for each product in a duplicate group
//    Priority: override > manual (mapping) > handle color > handle descriptor > variant Color
const HANDLE_COLOR_WORDS = ["black","navy","red","crimson","burgundy","emerald","green","blue","white","beige","pink","rose","gold","silver","brown","ivory","taupe","champagne","sand","yellow","mustard","lilac","teal"];
const HANDLE_DESC_WORDS = ["embroidered","printed","floral","autumn-leaves"];

function modifierFor(p) {
  const sku = p.title.match(/^([A-Z]\d+)/)?.[1];
  if (overrideBySku[sku]) return { source: "override", modifier: overrideBySku[sku] };
  if (manualBySku[sku]) return { source: "manual", modifier: manualBySku[sku] };
  // handle parse (skip SKU prefix part)
  const parts = p.handle.split("-").slice(1);
  const baseLc = stripSku(p.title).toLowerCase().split(/\s+/);
  const extras = parts.filter((w) => !baseLc.includes(w));
  const extrasJoined = extras.join("-");
  const handleColor = extras.find((w) => HANDLE_COLOR_WORDS.includes(w));
  const handleDesc = HANDLE_DESC_WORDS.find((d) => extras.includes(d) || extrasJoined.includes(d));
  if (handleColor) return { source: "handle-color", modifier: handleColor };
  if (handleDesc) return { source: "handle-desc", modifier: handleDesc };
  const colorOpt = (p.options || []).find((o) => /color/i.test(o.name));
  const colorOptVal = colorOpt?.values?.[0]?.toLowerCase();
  if (colorOptVal && HANDLE_COLOR_WORDS.includes(colorOptVal)) {
    return { source: "variant-color", modifier: colorOptVal };
  }
  return null;
}

// 4. Build proposals for every product in a duplicate group
const proposals = [];
for (const [, items] of dupGroups) {
  for (const p of items) {
    const mr = modifierFor(p);
    if (!mr) {
      proposals.push({ p, modifier: null, source: "missing", newEn: null, newAr: null });
      continue;
    }
    const newEn = insertEn(p.title, mr.modifier);
    proposals.push({ p, modifier: mr.modifier, source: mr.source, newEn, newAr: null });
  }
}

// 5. Fetch AR translations for the products being renamed
const dupIds = proposals.map((pr) => pr.p.id);
const arMap = new Map();
console.log(`Fetching AR translations for ${dupIds.length} products…`);
for (const id of dupIds) {
  const t = await gql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key value digest }
        translations(locale: "ar") { key value }
      }
    }`,
    { id },
  );
  const enContent = Object.fromEntries(
    (t.translatableResource?.translatableContent || []).map((c) => [c.key, c]),
  );
  const ar = Object.fromEntries(
    (t.translatableResource?.translations || []).map((x) => [x.key, x.value]),
  );
  arMap.set(id, { enContent, ar });
}

// 6. Build AR titles + SEO updates
for (const pr of proposals) {
  if (!pr.modifier) continue;
  const data = arMap.get(pr.p.id);
  const oldArTitle = data.ar.title || "";
  pr.oldArTitle = oldArTitle;
  pr.newAr = oldArTitle ? appendAr(oldArTitle, pr.modifier) : null;

  const oldSeoT = pr.p.seo?.title || "";
  const oldSeoD = pr.p.seo?.description || "";
  const oldArMetaT = data.ar.meta_title || "";
  const oldArMetaD = data.ar.meta_description || "";

  const oldBase = stripSku(pr.p.title);
  const newBase = stripSku(pr.newEn);
  pr.newSeoT = oldSeoT.includes(oldBase) ? oldSeoT.replaceAll(oldBase, newBase) : oldSeoT;
  pr.newSeoD = oldSeoD.includes(oldBase) ? oldSeoD.replaceAll(oldBase, newBase) : oldSeoD;
  pr.oldSeoT = oldSeoT;
  pr.oldSeoD = oldSeoD;

  if (pr.newAr) {
    const oldArBase = stripSku(oldArTitle);
    const newArBase = stripSku(pr.newAr);
    pr.newArMetaT = oldArMetaT.includes(oldArBase) ? oldArMetaT.replaceAll(oldArBase, newArBase) : oldArMetaT;
    pr.newArMetaD = oldArMetaD.includes(oldArBase) ? oldArMetaD.replaceAll(oldArBase, newArBase) : oldArMetaD;
  }
}

// 7. Sanity check — uniqueness within each original group (EN and AR)
for (const [groupKey, items] of dupGroups) {
  const enSeen = new Map();
  const arSeen = new Map();
  for (const p of items) {
    const pr = proposals.find((x) => x.p.id === p.id);
    if (pr?.newEn) {
      const k = stripSku(pr.newEn).toLowerCase();
      enSeen.set(k, (enSeen.get(k) || 0) + 1);
    }
    if (pr?.newAr) {
      const k = stripSku(pr.newAr);
      arSeen.set(k, (arSeen.get(k) || 0) + 1);
    }
  }
  for (const [k, n] of enSeen) {
    if (n > 1) console.warn(`⚠ EN COLLISION in "${groupKey}": ${n}× → "${k}"`);
  }
  for (const [k, n] of arSeen) {
    if (n > 1) console.warn(`⚠ AR COLLISION in "${groupKey}": ${n}× → "${k}"`);
  }
}

// 8. Print full proposal table
console.log("\n" + "═".repeat(82));
console.log("FINAL PROPOSAL TABLE");
console.log("═".repeat(82));
for (const [groupKey, items] of dupGroups) {
  console.log(`\n── "${groupKey}" (${items.length}) ─────────`);
  for (const p of items) {
    const pr = proposals.find((x) => x.p.id === p.id);
    const sku = p.title.match(/^([A-Z]\d+)/)?.[1] || "";
    const tag = pr.source === "override" ? "⚡override" :
                pr.source === "manual" ? "👁 manual" :
                pr.source === "handle-color" ? "✓ handle" :
                pr.source === "handle-desc" ? "✓ handle" :
                pr.source === "variant-color" ? "✓ variant" : "?? missing";
    console.log(`  ${tag.padEnd(11)} ${sku} | ${p.title}`);
    if (pr.newEn) console.log(`              → EN: ${pr.newEn}`);
    if (pr.newAr) console.log(`              → AR: ${pr.newAr}`);
    if (!pr.modifier) console.log(`              ⚠ no modifier — skipped`);
  }
}
console.log("\n" + "═".repeat(82));

const okCount = proposals.filter((p) => p.newEn && p.newAr).length;
const skipCount = proposals.length - okCount;
console.log(`Ready: ${okCount}  |  Skipped: ${skipCount}  |  Total: ${proposals.length}`);

if (!APPLY) {
  console.log("\nDry-run only. Re-run with --apply to write to Shopify.");
  process.exit(0);
}

// 9. Apply
let applied = 0;
let errors = 0;
for (const pr of proposals) {
  if (!pr.newEn || !pr.newAr) continue;
  const data = arMap.get(pr.p.id);

  const upd = await gql(
    `mutation($p: ProductInput!) {
      productUpdate(input: $p) {
        product { id }
        userErrors { field message }
      }
    }`,
    {
      p: {
        id: pr.p.id,
        title: pr.newEn,
        seo: { title: pr.newSeoT, description: pr.newSeoD },
      },
    },
  );
  if (upd.productUpdate.userErrors.length) {
    console.log(`✗ ${pr.p.title}: ${JSON.stringify(upd.productUpdate.userErrors)}`);
    errors++;
    continue;
  }

  const arPayload = [];
  const push = (key, value) => {
    const c = data.enContent[key];
    if (!c?.digest || !value) return;
    arPayload.push({ locale: "ar", key, value, translatableContentDigest: c.digest });
  };
  push("title", pr.newAr);
  if (pr.newArMetaT && pr.newArMetaT !== data.ar.meta_title) push("meta_title", pr.newArMetaT);
  if (pr.newArMetaD && pr.newArMetaD !== data.ar.meta_description) push("meta_description", pr.newArMetaD);

  if (arPayload.length) {
    const ar = await gql(
      `mutation($id: ID!, $t: [TranslationInput!]!) {
        translationsRegister(resourceId: $id, translations: $t) {
          translations { key }
          userErrors { field message }
        }
      }`,
      { id: pr.p.id, t: arPayload },
    );
    if (ar.translationsRegister.userErrors.length) {
      console.log(`✗ ${pr.p.title} (AR): ${JSON.stringify(ar.translationsRegister.userErrors)}`);
      errors++;
      continue;
    }
  }
  applied++;
  console.log(`✓ ${pr.p.title} → ${pr.newEn}`);
}
console.log(`\nApplied ${applied}  |  Errors ${errors}  |  Skipped ${skipCount}`);
