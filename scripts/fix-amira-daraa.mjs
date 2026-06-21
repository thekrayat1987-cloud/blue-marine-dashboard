// Reclassify A83 "Amira" from Bisht → Daraa (one-piece).
// Updates EN title/desc/type/tags/SEO + AR equivalents, and rebinds collections.
//
// Usage:
//   node --env-file=.env.local scripts/fix-amira-daraa.mjs           # dry-run
//   node --env-file=.env.local scripts/fix-amira-daraa.mjs --apply   # write

const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
if (!STORE || !TOKEN) { console.error("Missing env"); process.exit(1); }
const APPLY = process.argv.includes("--apply");
const ENDPOINT = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

const PRODUCT_ID = "gid://shopify/Product/10238424514860";

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

// 1. Fetch current product state
const cur = await gql(
  `query($id: ID!) {
    product(id: $id) {
      id title handle productType tags
      descriptionHtml
      seo { title description }
      collections(first: 50) { edges { node { id title handle } } }
    }
  }`,
  { id: PRODUCT_ID },
);
const p = cur.product;
if (!p) { console.error("Product not found"); process.exit(1); }

// 2. Fetch AR translations + digests
const tr = await gql(
  `query($id: ID!) {
    translatableResource(resourceId: $id) {
      translatableContent { key value digest locale }
      translations(locale: "ar") { key value }
    }
  }`,
  { id: PRODUCT_ID },
);
const enContent = Object.fromEntries(
  (tr.translatableResource?.translatableContent || []).map((c) => [c.key, c]),
);
const ar = Object.fromEntries(
  (tr.translatableResource?.translations || []).map((x) => [x.key, x.value]),
);

// 3. Build new content
const newTitleEn = "A83 – Amira Daraa";
const newTitleAr = "A83 – درّاعة أميرة";
const newType = "Daraa";

const newDescEn = `<p>Amira, meaning princess, is a daraa designed for commanding presence. A flowing one-piece silhouette in deep burgundy with a striking white zigzag motif and gold-toned heritage detailing at the cuffs and hem.</p>
<p>Tailored in our Kuwait atelier, the Amira Daraa pairs wide sleeves with a clean, modern cut — effortless to wear, refined in finish.</p>
<p>An ideal choice for weddings, evening gatherings, henna nights, and Eid — for the woman who values heritage design with a contemporary edge.</p>`;

const newDescAr = `<p>درّاعة أميرة قطعة واحدة مصمّمة لحضور أنيق ومميّز. تنسدل بلون العنّابي العميق مع نقشة زجزاج بيضاء بارزة، وتفاصيل تراثية ذهبية على الأساور والطرف السفلي.</p>
<p>مصنوعة في أتيليه بلو مارين بالكويت، تجمع درّاعة أميرة بين الأكمام الواسعة وقصّة عصرية مريحة وراقية.</p>
<p>خيار مثالي للأعراس، السهرات، ليالي الحنّاء، ومناسبات العيد — لكل امرأة تقدّر التصميم التراثي بلمسة معاصرة.</p>`;

const newSeoTitle = "Amira Daraa – Burgundy Zigzag One-Piece | Atelier Blue Marine";
const newSeoDesc = "A flowing burgundy daraa with white zigzag motif and gold heritage cuffs. Tailored in Kuwait — for weddings, evenings, henna, and Eid.";
const newArSeoTitle = "درّاعة أميرة – عنّابي بنقشة زجزاج | أتيليه بلو مارين";
const newArSeoDesc = "درّاعة قطعة واحدة بلون العنّابي مع نقشة زجزاج بيضاء وتفاصيل تراثية ذهبية. تفصيل كويتي — للأعراس، السهرات، الحنّاء والعيد.";

// 4. Tag rewrite — drop bisht-style tags, add daraa equivalents
const drop = new Set(["bisht", "بشت", "bisht-set", "bisht-noir", "women-bisht"]);
const kept = (p.tags || []).filter((t) => !drop.has(t.toLowerCase()));
const additions = ["daraa", "women-daraa", "درّاعة"].filter(
  (t) => !kept.some((k) => k.toLowerCase() === t.toLowerCase()),
);
const newTags = [...kept, ...additions];

// 5. Collection rebind plan
const inBisht = p.collections.edges.find((e) => /bisht/i.test(e.node.handle) || /bisht/i.test(e.node.title));
const inDaraa = p.collections.edges.find((e) => /daraa|درّاعة|دراعة/i.test(e.node.handle) || /daraa|درّاعة|دراعة/i.test(e.node.title));

console.log("═".repeat(82));
console.log("CURRENT");
console.log("═".repeat(82));
console.log("Title EN :", p.title);
console.log("Title AR :", ar.title || "(none)");
console.log("Type     :", p.productType);
console.log("Tags     :", (p.tags || []).join(", "));
console.log("SEO T EN :", p.seo?.title || "(none)");
console.log("SEO D EN :", p.seo?.description || "(none)");
console.log("SEO T AR :", ar.meta_title || "(none)");
console.log("SEO D AR :", ar.meta_description || "(none)");
console.log("Collections:");
for (const e of p.collections.edges) console.log("  -", e.node.handle, "—", e.node.title);

console.log("\n" + "═".repeat(82));
console.log("PROPOSED");
console.log("═".repeat(82));
console.log("Title EN :", newTitleEn);
console.log("Title AR :", newTitleAr);
console.log("Type     :", newType);
console.log("Tags     :", newTags.join(", "));
console.log("SEO T EN :", newSeoTitle);
console.log("SEO D EN :", newSeoDesc);
console.log("SEO T AR :", newArSeoTitle);
console.log("SEO D AR :", newArSeoDesc);
console.log("Desc EN  :\n" + newDescEn);
console.log("Desc AR  :\n" + newDescAr);
console.log("\nCollection moves:");
console.log("  Remove from:", inBisht ? `${inBisht.node.handle} (${inBisht.node.title})` : "(none — no bisht collection found)");
console.log("  Add to     :", inDaraa ? `${inDaraa.node.handle} (already member)` : "(needs daraa collection — search below)");

if (!inDaraa) {
  // Search globally for a daraa collection candidate
  const sc = await gql(
    `query { collections(first: 50, query: "daraa OR درّاعة OR دراعة") { edges { node { id handle title } } } }`,
    {},
  );
  console.log("  Daraa collection candidates:");
  for (const e of sc.collections.edges) console.log("    *", e.node.handle, "—", e.node.title, "—", e.node.id);
}

if (!APPLY) {
  console.log("\nDry-run only. Re-run with --apply to write.");
  process.exit(0);
}

// 6. Apply EN updates
const upd = await gql(
  `mutation($p: ProductInput!) {
    productUpdate(input: $p) {
      product { id }
      userErrors { field message }
    }
  }`,
  {
    p: {
      id: PRODUCT_ID,
      title: newTitleEn,
      descriptionHtml: newDescEn,
      productType: newType,
      tags: newTags,
      seo: { title: newSeoTitle, description: newSeoDesc },
    },
  },
);
if (upd.productUpdate.userErrors.length) {
  console.error("EN update errors:", JSON.stringify(upd.productUpdate.userErrors));
  process.exit(1);
}
console.log("✓ EN product updated");

// 7. Apply AR translations
const arPayload = [];
const push = (key, value) => {
  const c = enContent[key];
  if (!c?.digest || !value) return;
  arPayload.push({ locale: "ar", key, value, translatableContentDigest: c.digest });
};
push("title", newTitleAr);
push("body_html", newDescAr);
push("meta_title", newArSeoTitle);
push("meta_description", newArSeoDesc);

if (arPayload.length) {
  const arRes = await gql(
    `mutation($id: ID!, $t: [TranslationInput!]!) {
      translationsRegister(resourceId: $id, translations: $t) {
        translations { key }
        userErrors { field message }
      }
    }`,
    { id: PRODUCT_ID, t: arPayload },
  );
  if (arRes.translationsRegister.userErrors.length) {
    console.error("AR translation errors:", JSON.stringify(arRes.translationsRegister.userErrors));
    process.exit(1);
  }
  console.log("✓ AR translations updated:", arRes.translationsRegister.translations.map((x) => x.key).join(", "));
}

// 8. Collection rebind
if (inBisht) {
  const r = await gql(
    `mutation($id: ID!, $ids: [ID!]!) {
      collectionRemoveProducts(id: $id, productIds: $ids) {
        userErrors { field message }
      }
    }`,
    { id: inBisht.node.id, ids: [PRODUCT_ID] },
  );
  if (r.collectionRemoveProducts.userErrors.length) {
    console.warn("Bisht remove errors:", JSON.stringify(r.collectionRemoveProducts.userErrors));
  } else {
    console.log(`✓ Removed from ${inBisht.node.handle}`);
  }
}

console.log("\nDone.");
