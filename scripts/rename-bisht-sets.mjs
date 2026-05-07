// Rename A125/A126/A127 from "Abaya 3-Piece Set" → "Bisht 3-Piece Set"
// across title (EN+AR), tags, descriptionHtml, body_html (AR), SEO (EN+AR).
//
// Usage:
//   node --env-file=.env.local scripts/rename-bisht-sets.mjs            # dry-run
//   node --env-file=.env.local scripts/rename-bisht-sets.mjs --apply    # write
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

function rewriteEn(s) {
  if (!s) return s;
  return s
    .replace(/Abaya 3-Piece Set/g, "Bisht 3-Piece Set")
    .replace(/abaya 3-piece set/g, "bisht 3-piece set")
    .replace(/Abaya Set/g, "Bisht Set")
    .replace(/abaya set/g, "bisht set")
    .replace(/Abayas/g, "Bishts")
    .replace(/abayas/g, "bishts")
    .replace(/Abaya/g, "Bisht")
    .replace(/abaya/g, "bisht");
}
function rewriteAr(s) {
  if (!s) return s;
  let out = s.replace(/عباية/g, "بشت").replace(/عبايات/g, "بشوت");
  // Fix gender agreement: bisht (بشت) is masculine, abaya (عباية) was feminine.
  // Adjectives that previously agreed with عباية must lose the feminine ـة when next to بشت.
  const pairs = [
    [/بشت سوداء/g, "بشت أسود"],
    [/بشت خارجية/g, "بشت خارجي"],
    [/بشت داخلية/g, "بشت داخلي"],
    [/بشت مفتوحة/g, "بشت مفتوح"],
    [/بشت كلاسيكية/g, "بشت كلاسيكي"],
    [/بشت مطبوعة/g, "بشت مطبوع"],
    [/البشت السوداء/g, "البشت الأسود"],
    [/البشت الخارجية/g, "البشت الخارجي"],
    [/البشت الداخلية/g, "البشت الداخلي"],
    [/البشت المفتوحة/g, "البشت المفتوح"],
    [/البشت الكلاسيكية/g, "البشت الكلاسيكي"],
    [/البشت المطبوعة/g, "البشت المطبوع"],
    [/أكمام العباية/g, "أكمام البشت"], // already covered by عباية→بشت but explicit
    [/ببشت خارجية/g, "ببشت خارجي"],
    [/ببشت سوداء/g, "ببشت أسود"],
    // After "خارجي/داخلي" + "سوداء" the second adjective is also describing بشت → masculine
    [/خارجي سوداء/g, "خارجي أسود"],
    [/داخلي سوداء/g, "داخلي أسود"],
    // A127 meta_title oddity: original phrasing trailed "سوداء" referring to عباية
    [/ليلى سوداء/g, "ليلى أسود"],
  ];
  for (const [re, rep] of pairs) out = out.replace(re, rep);
  return out;
}
function rewriteTags(tags) {
  const out = new Set();
  for (const t of tags) {
    let v = t;
    if (v === "abaya") v = "bisht";
    else if (v === "عباية") v = "بشت";
    else if (v === "abayas") v = "bishts";
    out.add(v);
  }
  // Ensure bisht-set descriptors are present for these multi-piece products
  out.add("bisht");
  out.add("بشت");
  return [...out].sort((a, b) => a.localeCompare(b));
}

// Override AR titles to a clean "{Name} طقم بشت ٣ قطع" pattern after replacement
function normalizedArTitle(sku, currentArTitle) {
  // Try to extract the Arabic given name (the word(s) right after "{SKU} – ")
  const m = currentArTitle.match(/^([A-Z]\d+)\s*[–-]\s*(.+)$/);
  if (!m) return rewriteAr(currentArTitle);
  const [, code, rest] = m;
  // Pull the first word as the name (Bandar / Reem / Layla → بندر / ريم / ليلى)
  const nameMatch = rest.match(/^(\S+)/);
  const name = nameMatch ? nameMatch[1] : rest;
  return `${code} – ${name} طقم بشت ٣ قطع`;
}

const SKUS = ["A125", "A126", "A127"];

for (const sku of SKUS) {
  const d = await gql(
    `query($q: String!) { products(first: 5, query: $q) { edges { node {
      id title tags descriptionHtml
      seo { title description }
    } } } }`,
    { q: `title:${sku}*` },
  );
  const node = d.products.edges.find((e) => e.node.title.startsWith(`${sku} `))?.node;
  if (!node) { console.log(`[${sku}] not found`); continue; }
  const t = await gql(
    `query($id: ID!) { translatableResource(resourceId: $id) {
      translatableContent { key value digest }
      translations(locale: "ar") { key value }
    } }`,
    { id: node.id },
  );
  const enContent = Object.fromEntries(t.translatableResource.translatableContent.map((c) => [c.key, c]));
  const arByKey = Object.fromEntries(t.translatableResource.translations.map((x) => [x.key, x.value]));

  const newTitle = rewriteEn(node.title);
  const newDescHtml = rewriteEn(node.descriptionHtml || "");
  const newSeoTitle = rewriteEn(node.seo?.title || "");
  const newSeoDesc = rewriteEn(node.seo?.description || "");
  const newTags = rewriteTags(node.tags);

  const oldArTitle = arByKey.title || "";
  const oldArMetaTitle = arByKey.meta_title || "";
  const oldArMetaDesc = arByKey.meta_description || "";
  const oldArBody = arByKey.body_html || "";
  const newArTitle = normalizedArTitle(sku, oldArTitle);
  const newArMetaTitle = rewriteAr(oldArMetaTitle);
  const newArMetaDesc = rewriteAr(oldArMetaDesc);
  const newArBody = rewriteAr(oldArBody);

  console.log("=".repeat(72));
  console.log(`[${sku}] ${node.id}`);
  console.log(`  EN title:    ${node.title}\n             → ${newTitle}`);
  console.log(`  AR title:    ${oldArTitle}\n             → ${newArTitle}`);
  console.log(`  SEO title:   ${node.seo?.title}\n             → ${newSeoTitle}`);
  console.log(`  SEO desc:    ${node.seo?.description}\n             → ${newSeoDesc}`);
  console.log(`  AR meta T:   ${oldArMetaTitle}\n             → ${newArMetaTitle}`);
  console.log(`  AR meta D:   ${oldArMetaDesc}\n             → ${newArMetaDesc}`);
  console.log(`  Tags before: ${node.tags.join(", ")}`);
  console.log(`  Tags after:  ${newTags.join(", ")}`);
  console.log(`  Body EN: ${node.descriptionHtml.length}→${newDescHtml.length} chars`);
  console.log(`  Body AR: ${oldArBody.length}→${newArBody.length} chars`);

  if (!APPLY) continue;

  // Update EN side
  const upd = await gql(
    `mutation($p: ProductInput!) {
      productUpdate(input: $p) {
        product { id }
        userErrors { field message }
      }
    }`,
    {
      p: {
        id: node.id,
        title: newTitle,
        descriptionHtml: newDescHtml,
        tags: newTags,
        seo: { title: newSeoTitle, description: newSeoDesc },
      },
    },
  );
  if (upd.productUpdate.userErrors.length) {
    console.log("  EN userErrors:", upd.productUpdate.userErrors);
  } else {
    console.log("  EN updated ✓");
  }

  // Update AR translations
  const arPayload = [];
  const push = (key, value) => {
    const en = enContent[key];
    if (!en?.digest) return;
    if (value && value !== arByKey[key]) {
      arPayload.push({ locale: "ar", key, value, translatableContentDigest: en.digest });
    }
  };
  push("title", newArTitle);
  push("body_html", newArBody);
  push("meta_title", newArMetaTitle);
  push("meta_description", newArMetaDesc);

  if (arPayload.length === 0) {
    console.log("  AR no changes");
    continue;
  }
  const ar = await gql(
    `mutation($id: ID!, $t: [TranslationInput!]!) {
      translationsRegister(resourceId: $id, translations: $t) {
        translations { key }
        userErrors { field message }
      }
    }`,
    { id: node.id, t: arPayload },
  );
  if (ar.translationsRegister.userErrors.length) {
    console.log("  AR userErrors:", ar.translationsRegister.userErrors);
  } else {
    console.log(`  AR registered ${ar.translationsRegister.translations.length}/${arPayload.length} ✓`);
  }
}

console.log(APPLY ? "\nDone." : "\nDry-run only. Re-run with --apply to write.");
