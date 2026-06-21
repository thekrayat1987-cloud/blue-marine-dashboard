// Dry-run: propose unique EN + AR titles for products that share the same name.
// Differentiator is extracted from (1) handle, (2) "Color" variant option, (3) tags.
// Strategy: insert the differentiator before the garment word.
//   "Sahar Daraa"            + black  → "Sahar Black Daraa" / "سحر سوداء درّاعة" (fem agreement)
//   "Yaqut 3-Piece Bisht Set"+ emerald→ "Yaqut Emerald 3-Piece Bisht Set"
//
// Usage:
//   node --env-file=.env.local scripts/dedupe-product-titles.mjs           # dry-run
//   node --env-file=.env.local scripts/dedupe-product-titles.mjs --apply   # write
//
// SEO meta_title / meta_description are also rewritten when they currently echo
// the old (non-unique) title verbatim.

const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
if (!STORE || !TOKEN) { console.error("Missing env"); process.exit(1); }
const APPLY = process.argv.includes("--apply");
const ENDPOINT = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

async function gql(query, variables) {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Color + fabric vocabulary (EN ↔ AR with masculine / feminine forms)
// ─────────────────────────────────────────────────────────────────────────────
const COLOR_AR = {
  // [masculine, feminine]
  black:    ["أسود",   "سوداء"],
  navy:     ["كحلي",   "كحلية"],
  red:      ["أحمر",   "حمراء"],
  crimson:  ["قرمزي",  "قرمزية"],
  burgundy: ["عنابي",  "عنابية"],
  emerald:  ["زمردي",  "زمردية"],
  green:    ["أخضر",   "خضراء"],
  blue:     ["أزرق",   "زرقاء"],
  white:    ["أبيض",   "بيضاء"],
  beige:    ["بيج",    "بيج"],
  pink:     ["وردي",   "وردية"],
  rose:     ["وردي",   "وردية"],
  gold:     ["ذهبي",   "ذهبية"],
  silver:   ["فضي",    "فضية"],
  brown:    ["بني",    "بنية"],
  ivory:    ["عاجي",   "عاجية"],
  taupe:    ["رمادي بني", "رمادية بنية"],
  champagne:["شامبني", "شامبني"],
  sand:     ["رملي",   "رملية"],
  dawn:     ["الفجر",  "الفجر"],   // already an AR-style modifier, no gender swap
};

// Some descriptors that may appear instead of/with a color in the handle
const DESCRIPTOR_AR = {
  embroidered:   ["مطرّز",        "مطرّزة"],
  printed:       ["مطبوع",        "مطبوعة"],
  floral:        ["بأزهار",       "بأزهار"],
  "autumn-leaves": ["بأوراق الخريف", "بأوراق الخريف"],
};

// Pretty-print a descriptor for English titles ("autumn-leaves" → "Autumn Leaves")
function prettyEn(s) {
  return s.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// Known color words (for handle parsing)
const COLOR_WORDS = Object.keys(COLOR_AR);
const DESCRIPTOR_WORDS = Object.keys(DESCRIPTOR_AR);

// Garment gender for Arabic adjective agreement
function arGender(garmentArWord) {
  // Feminine: درّاعة, دراعة, عباية, قفطان (قفطان is actually masculine but we keep simple)
  if (/درّاعة|دراعة|عباية/.test(garmentArWord)) return "f";
  return "m";
}

// Extract differentiator from handle (after SKU prefix)
function extractFromHandle(handle, baseEnWords) {
  // "a102-sahar-daraa-black" → ["sahar","daraa","black"]
  const parts = handle.split("-").slice(1); // drop "a102"
  const baseLc = baseEnWords.map((w) => w.toLowerCase());
  const extras = parts.filter((p) => !baseLc.includes(p));
  const extrasJoined = extras.join("-");
  const color = extras.find((w) => COLOR_WORDS.includes(w));
  // Descriptors may be multi-word ("autumn-leaves") — match against the joined string
  const desc = DESCRIPTOR_WORDS.find((d) => extras.includes(d) || extrasJoined.includes(d));
  return { color, desc, extras };
}

// Insert differentiator into EN title (right after the given name).
//   "A102 – Sahar Daraa"            → "A102 – Sahar Black Daraa"
//   "A56 – Yaqut 3-Piece Bisht Set" → "A56 – Yaqut Burgundy 3-Piece Bisht Set"
function insertEn(title, modifier) {
  const pretty = prettyEn(modifier);
  return title.replace(/^([A-Z]\d+\s*[–-]\s*\S+)\s+/, `$1 ${pretty} `);
}

// Append differentiator to the END of the AR title (Arabic adjectives follow the noun).
//   "A102 – سحر درّاعة"               + black  → "A102 – سحر درّاعة سوداء"
//   "A56 – ياقوت طقم ٣ قطع بشت"        + burgundy → "A56 – ياقوت طقم ٣ قطع بشت عنابي"
//   "A76 – أميرة دراعة"                + autumn-leaves → "A76 – أميرة دراعة بأوراق الخريف"
function insertAr(arTitle, color, desc, garmentWord) {
  const gender = arGender(garmentWord);
  let mod = "";
  if (color && COLOR_AR[color]) {
    mod = COLOR_AR[color][gender === "f" ? 1 : 0];
  } else if (desc && DESCRIPTOR_AR[desc]) {
    mod = DESCRIPTOR_AR[desc][gender === "f" ? 1 : 0];
  } else {
    return null;
  }
  if (!arTitle) return null;
  return `${arTitle.trimEnd()} ${mod}`;
}

// Detect garment word in EN title (last meaningful word)
function detectGarmentEn(title) {
  if (/Bisht Set/i.test(title)) return "bisht-set";
  if (/Daraa Set|Dara Set/i.test(title)) return "daraa-set";
  if (/Bisht/i.test(title)) return "bisht";
  if (/Daraa|Dara/i.test(title)) return "daraa";
  return "";
}
function detectGarmentAr(title) {
  if (/بشت/.test(title) && /طقم/.test(title)) return "بشت طقم";
  if (/درّاعة|دراعة/.test(title) && /طقم/.test(title)) return "درّاعة طقم";
  if (/بشت/.test(title)) return "بشت";
  if (/درّاعة|دراعة/.test(title)) return "درّاعة";
  return "";
}

function stripSku(t) { return t.replace(/^[A-Z]\d+\s*[–-]\s*/, "").trim(); }
function baseWords(t) { return stripSku(t).split(/\s+/); }

// ─────────────────────────────────────────────────────────────────────────────
// 1. Fetch all products
// ─────────────────────────────────────────────────────────────────────────────
console.log("Fetching products…");
const all = [];
let cursor = null;
while (true) {
  const d = await gql(
    `query($c: String) {
      products(first: 50, after: $c, sortKey: TITLE) {
        pageInfo { hasNextPage endCursor }
        edges { node {
          id title handle tags
          seo { title description }
          options { name values }
        } }
      }
    }`,
    { c: cursor },
  );
  for (const e of d.products.edges) all.push(e.node);
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}
console.log(`  ${all.length} products\n`);

// 2. Group by stripped EN title (lowercase)
const enGroups = new Map();
for (const p of all) {
  const k = stripSku(p.title).toLowerCase();
  if (!enGroups.has(k)) enGroups.set(k, []);
  enGroups.get(k).push(p);
}

// Only keep groups with > 1 entry
const dupGroups = [...enGroups.entries()].filter(([, items]) => items.length > 1);
console.log(`Found ${dupGroups.length} duplicate EN-title groups`);

// 3. For each duplicate, fetch AR translation (only the products we care about)
const dupIds = new Set();
for (const [, items] of dupGroups) for (const p of items) dupIds.add(p.id);

console.log(`Fetching AR translations for ${dupIds.size} products…`);
const arMap = new Map();
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
console.log("  done\n");

// ─────────────────────────────────────────────────────────────────────────────
// 4. Build proposals
// ─────────────────────────────────────────────────────────────────────────────
const proposals = [];   // {p, newEnTitle, newArTitle, newSeoTitle, newSeoDesc, newArMetaTitle, newArMetaDesc, status, note}
let resolvedCount = 0;
let needsManualCount = 0;

for (const [, items] of dupGroups) {
  for (const p of items) {
    const arData = arMap.get(p.id);
    const oldArTitle = arData?.ar.title || "";
    const baseEn = baseWords(p.title);
    const fromHandle = extractFromHandle(p.handle, baseEn);

    // Look for "Color" option
    const colorOpt = (p.options || []).find((o) => /color/i.test(o.name));
    const colorOptVal = colorOpt?.values?.[0]?.toLowerCase();

    // Priority: handle color > handle descriptor > variant Color option
    let color = fromHandle.color;
    let desc = fromHandle.desc;
    if (!color && !desc && colorOptVal && COLOR_WORDS.includes(colorOptVal)) {
      color = colorOptVal;
    }

    let newEnTitle = null;
    let newArTitle = null;
    let status = "needs-manual";
    let note = "";

    if (color || desc) {
      const modifierEn = color || desc;
      newEnTitle = insertEn(p.title, modifierEn);
      const arGarment = detectGarmentAr(oldArTitle);
      newArTitle = oldArTitle ? insertAr(oldArTitle, color, desc, arGarment) : null;
      if (newArTitle) {
        status = "auto";
        resolvedCount++;
      } else {
        status = "needs-manual";
        note = `EN ok but AR pattern not matched (oldAR="${oldArTitle}")`;
        needsManualCount++;
      }
    } else {
      note = "no distinguishing word in handle or variant Color option";
      needsManualCount++;
    }

    // SEO updates: only rewrite if current SEO title equals old EN title (i.e. it just echoes the title)
    const oldSeoT = p.seo?.title || "";
    const oldSeoD = p.seo?.description || "";
    const oldArMetaT = arData?.ar.meta_title || "";
    const oldArMetaD = arData?.ar.meta_description || "";

    let newSeoTitle = oldSeoT;
    let newSeoDesc = oldSeoD;
    let newArMetaTitle = oldArMetaT;
    let newArMetaDesc = oldArMetaD;

    if (newEnTitle) {
      // Replace old base name in SEO title with new base name where it appears
      const oldBase = stripSku(p.title);
      const newBase = stripSku(newEnTitle);
      if (oldSeoT && oldSeoT.includes(oldBase)) {
        newSeoTitle = oldSeoT.replaceAll(oldBase, newBase);
      }
      if (oldSeoD && oldSeoD.includes(oldBase)) {
        newSeoDesc = oldSeoD.replaceAll(oldBase, newBase);
      }
    }
    if (newArTitle) {
      const oldArBase = stripSku(oldArTitle);
      const newArBase = stripSku(newArTitle);
      if (oldArBase && oldArMetaT.includes(oldArBase)) {
        newArMetaTitle = oldArMetaT.replaceAll(oldArBase, newArBase);
      }
      if (oldArBase && oldArMetaD.includes(oldArBase)) {
        newArMetaDesc = oldArMetaD.replaceAll(oldArBase, newArBase);
      }
    }

    proposals.push({
      p, oldArTitle,
      newEnTitle, newArTitle,
      newSeoTitle, newSeoDesc,
      newArMetaTitle, newArMetaDesc,
      status, note,
      color, desc,
    });
  }
}

// 4b. Second pass — if two products in the same group still resolve to the same
//     EN title, demote both to needs-manual (we won't replace one duplicate with
//     another).
for (const [, items] of dupGroups) {
  const proposed = items.map((p) => proposals.find((pr) => pr.p.id === p.id));
  const seen = new Map();
  for (const pr of proposed) {
    if (!pr.newEnTitle) continue;
    const k = stripSku(pr.newEnTitle).toLowerCase();
    if (!seen.has(k)) seen.set(k, []);
    seen.get(k).push(pr);
  }
  for (const [k, group] of seen) {
    if (group.length > 1) {
      for (const pr of group) {
        if (pr.status !== "needs-manual") {
          resolvedCount--;
          needsManualCount++;
        }
        pr.status = "needs-manual";
        pr.note = `would still collide with ${group.length - 1} sibling on "${k}"`;
        pr.newEnTitle = null;
        pr.newArTitle = null;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Print report
// ─────────────────────────────────────────────────────────────────────────────
console.log("═".repeat(78));
console.log("PROPOSED RENAMES");
console.log("═".repeat(78));

for (const [groupKey, items] of dupGroups) {
  console.log(`\n── "${groupKey}" (${items.length} products) ─────────`);
  for (const p of items) {
    const pr = proposals.find((x) => x.p.id === p.id);
    const tag = pr.status === "auto" ? "✓" : "?";
    console.log(`  [${tag}] ${p.title}`);
    console.log(`        handle: ${p.handle}`);
    if (pr.newEnTitle) {
      console.log(`        EN  → ${pr.newEnTitle}`);
    } else {
      console.log(`        EN  → (manual: ${pr.note})`);
    }
    console.log(`        AR  : ${pr.oldArTitle || "(no AR)"}`);
    if (pr.newArTitle) {
      console.log(`        AR  → ${pr.newArTitle}`);
    } else if (pr.oldArTitle) {
      console.log(`        AR  → (manual)`);
    }
  }
}

console.log("\n" + "═".repeat(78));
console.log(`Summary: ${resolvedCount} auto-resolved, ${needsManualCount} need manual input`);
console.log("═".repeat(78));

// Write a manual-input template so the user can fill in the missing modifiers.
const manualRows = proposals
  .filter((pr) => pr.status === "needs-manual")
  .map((pr) => ({
    sku: pr.p.title.match(/^([A-Z]\d+)/)?.[1] || "",
    title_now: pr.p.title,
    handle: pr.p.handle,
    ar_now: pr.oldArTitle,
    note: pr.note,
    fill_modifier: "",   // ← fill with one of: black, navy, red, crimson, burgundy,
                         //   emerald, green, blue, white, beige, pink, gold, silver,
                         //   brown, ivory, taupe, champagne, sand,
                         //   embroidered, printed, floral, autumn-leaves
  }));
const fs = await import("node:fs/promises");
await fs.writeFile(
  new URL("../dedupe-manual-input.json", import.meta.url),
  JSON.stringify(manualRows, null, 2),
);
console.log(`\nWrote dedupe-manual-input.json (${manualRows.length} rows for you to fill).`);

if (!APPLY) {
  console.log("\nDry-run only. Re-run with --apply to write the auto-resolved ones.");
  console.log("(needs-manual rows will be skipped unless you fill dedupe-manual-input.json)");
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Apply (only for auto-resolved rows)
// ─────────────────────────────────────────────────────────────────────────────
let applied = 0;
let skipped = 0;
for (const pr of proposals) {
  if (!pr.newEnTitle || !pr.newArTitle) { skipped++; continue; }
  const arData = arMap.get(pr.p.id);
  const enContent = arData?.enContent || {};

  // Update EN
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
        title: pr.newEnTitle,
        seo: { title: pr.newSeoTitle, description: pr.newSeoDesc },
      },
    },
  );
  if (upd.productUpdate.userErrors.length) {
    console.log(`[${pr.p.title}] EN errors:`, upd.productUpdate.userErrors);
    continue;
  }

  // Update AR translations
  const arPayload = [];
  const push = (key, value) => {
    const c = enContent[key];
    if (!c?.digest || !value) return;
    arPayload.push({ locale: "ar", key, value, translatableContentDigest: c.digest });
  };
  push("title", pr.newArTitle);
  if (pr.newArMetaTitle && pr.newArMetaTitle !== arData.ar.meta_title) push("meta_title", pr.newArMetaTitle);
  if (pr.newArMetaDesc && pr.newArMetaDesc !== arData.ar.meta_description) push("meta_description", pr.newArMetaDesc);

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
      console.log(`[${pr.p.title}] AR errors:`, ar.translationsRegister.userErrors);
    }
  }
  applied++;
  console.log(`  ✓ ${pr.p.title} → ${pr.newEnTitle}`);
}

console.log(`\nApplied ${applied}, skipped ${skipped} (manual).`);
