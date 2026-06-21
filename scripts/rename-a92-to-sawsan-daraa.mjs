// Rename A92 from "Yaqut Emerald Daraa" → "Sawsan Daraa" (iris flower, fits 2 colors)
// A92 colors: Blue + Mustard Yellow. "Yaqut" (ruby) implies single jewel-tone color, doesn't fit.
// Updates: title (EN+AR), handle, seo (EN+AR), description body (EN+AR), image alt text, tags.
// Creates 301 urlRedirect from old handle.
//
// Usage:
//   node --env-file=.env.local scripts/rename-a92-to-sawsan-daraa.mjs            # dry-run
//   node --env-file=.env.local scripts/rename-a92-to-sawsan-daraa.mjs --apply    # write

import { readFileSync } from "node:fs";
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

const OLD_HANDLE = "a92-yaqut-emerald-daraa";
const NEW_HANDLE = "a92-sawsan-daraa";

const PLAN = {
  title:    "A92 – Sawsan Daraa",
  arTitle:  "A92 – درّاعة سوسن",
  handle:   NEW_HANDLE,
  seoTitle: "Sawsan Daraa | Blue & Mustard Striped Chiffon Khaleeji Gown | Atelier Blue Marine",
  arMetaTitle: "درّاعة سوسن | شيفون مخطط أزرق وأصفر خليجي | أتيليه بلو مارين",
  seoDesc:  "Discover the Sawsan Daraa, a flowing striped chiffon gown in blue and mustard yellow with balloon sleeves. Atelier-made in Kuwait for formal evenings and Eid across the Gulf.",
  arMetaDesc: "اكتشفي درّاعة سوسن، تصميم انسيابي من الشيفون المخطط بدرجات الأزرق والأصفر الخردلي مع أكمام منفوخة. صُنعت في أتيليه الكويت للسهرات الرسمية والعيد في الخليج.",
  bodyHtmlEn:
`<p>The Sawsan Daraa takes its name from the iris flower — a bloom that wears many colors at once. Here, it speaks through deep blue and warm mustard yellow, flowing in graceful stripes. This full-length silhouette offers a relaxed yet refined presence, designed for effortless elegance.</p>
<p>Crafted from a lightweight chiffon, the daraa features delicate horizontal stripes that create subtle movement. The wide, balloon sleeves are detailed with a contrasting geometric pattern, adding a touch of Khaleeji heritage. Each piece is atelier-made in Kuwait, reflecting meticulous attention to detail.</p>
<p>Perfect for formal gatherings, Eid celebrations, or special evenings, this daraa offers versatile styling. Pair it with delicate gold jewellery and a structured handbag for a complete look. An effortless choice for the woman who values comfort and distinctive style across the Gulf.</p>

<!-- gmc-enriched:start -->
<h3>Product details</h3>
<ul>
<li>
<strong>Colors:</strong> Blue, Mustard Yellow</li>
<li>
<strong>Sizes:</strong> XS – 3XL</li>
<li>
<strong>Material:</strong> Cotton, Silk</li>
<li>
<strong>Pattern:</strong> Striped</li>
</ul>
<!-- gmc-enriched:end -->`,
  bodyHtmlAr:
`<p>درّاعة سوسن تستوحي اسمها من زهرة السوسن — زهرة تجمع بين عدة ألوان في الوقت ذاته. هنا، تتجلى بدرجات الأزرق العميق والأصفر الخردلي الدافئ، تنساب بخطوط رشيقة. هذا التصميم الطويل يمنح حضوراً مريحاً وراقياً، صُمم لأناقة بلا مجهود.</p>
<p>صُنعت الدرّاعة من قماش الشيفون الخفيف، وتتميز بخطوط أفقية رقيقة تخلق حركة ناعمة. الأكمام الواسعة والمنفوخة مزينة بنمط هندسي متباين، يضيف لمسة من التراث الخليجي. كل قطعة مصنوعة في أتيليه الكويت، مما يعكس اهتماماً دقيقاً بالتفاصيل.</p>
<p>مثالية للمناسبات الرسمية، احتفالات العيد، أو السهرات الخاصة، هذه الدرّاعة توفر أناقة متعددة الاستخدامات. نسقيها مع مجوهرات ذهبية ناعمة وحقيبة يد أنيقة لمظهر متكامل. خيار سهل للمرأة التي تقدر الراحة والأناقة المميزة في جميع أنحاء الخليج.</p>

<!-- gmc-enriched:start -->
<h3>تفاصيل المنتج</h3>
<ul>
<li><strong>الألوان:</strong> أزرق، أصفر خردلي</li>
<li><strong>المقاسات:</strong> XS – 3XL</li>
<li><strong>مادة الصنع:</strong> قطن، حرير</li>
<li><strong>النقش:</strong> مخطط</li>
</ul>
<!-- gmc-enriched:end -->`,
};

// --- fetch current product ---
const d = await gql(
  `query($q: String!) { products(first: 5, query: $q) { edges { node {
    id handle title tags
    seo { title description }
    descriptionHtml
    media(first: 20) {
      edges { node { id alt ... on MediaImage { __typename } } }
    }
  } } } }`,
  { q: `title:A92*` },
);
const node = d.products.edges.find((e) => e.node.title.startsWith("A92 "))?.node;
if (!node) { console.log("[A92] not found"); process.exit(1); }

const t = await gql(
  `query($id: ID!) { translatableResource(resourceId: $id) {
    translatableContent { key value digest }
    translations(locale: "ar") { key value }
  } }`,
  { id: node.id },
);
const enContent = Object.fromEntries(t.translatableResource.translatableContent.map((c) => [c.key, c]));
const arByKey = Object.fromEntries(t.translatableResource.translations.map((x) => [x.key, x.value]));

console.log("=".repeat(72));
console.log(`[A92] ${node.id}`);
console.log(`  EN title:    ${node.title}\n           → ${PLAN.title}`);
console.log(`  AR title:    ${arByKey.title || "(none)"}\n           → ${PLAN.arTitle}`);
console.log(`  handle:      ${node.handle}\n           → ${PLAN.handle}`);
console.log(`  SEO title:   ${node.seo?.title}\n           → ${PLAN.seoTitle}`);
console.log(`  AR meta T:   ${arByKey.meta_title || "(none)"}\n           → ${PLAN.arMetaTitle}`);
console.log(`  SEO desc:    ${node.seo?.description}\n           → ${PLAN.seoDesc}`);
console.log(`  AR meta D:   ${arByKey.meta_description || "(none)"}\n           → ${PLAN.arMetaDesc}`);
console.log(`  body (EN):   ${node.descriptionHtml.slice(0, 80)}...\n           → ${PLAN.bodyHtmlEn.slice(0, 80)}...`);
console.log(`  body (AR):   ${(arByKey.body_html || "").slice(0, 80)}...\n           → ${PLAN.bodyHtmlAr.slice(0, 80)}...`);

// Cleaned tags (drop emerald-trim; current colors are blue + mustard)
const newTags = node.tags.filter((tag) => tag !== "emerald-trim");
const addTags = ["mustard-yellow", "blue", "sawsan"];
for (const at of addTags) if (!newTags.includes(at)) newTags.push(at);
console.log(`  tags:        drop emerald-trim, add mustard-yellow/blue/sawsan`);

// Image alt text changes (use Media IDs for productUpdateMedia)
const imgsToUpdate = node.media.edges
  .filter((e) => e.node.alt && /Yaqut|ياقوت/i.test(e.node.alt))
  .map((e) => ({
    id: e.node.id,
    oldAlt: e.node.alt,
    newAlt: e.node.alt
      .replace(/Yaqut Emerald Daraa/g, "Sawsan Daraa")
      .replace(/ياقوت زمرد درّاعة/g, "درّاعة سوسن"),
  }));
console.log(`  images:      ${imgsToUpdate.length} alt-text updates`);
for (const im of imgsToUpdate) console.log(`               • ${im.oldAlt}\n                 → ${im.newAlt}`);

if (!APPLY) {
  console.log("\nDry-run only. Re-run with --apply to write.");
  process.exit(0);
}

// --- Update EN core ---
const upd = await gql(
  `mutation($p: ProductInput!) {
    productUpdate(input: $p) {
      product { id handle }
      userErrors { field message }
    }
  }`,
  {
    p: {
      id: node.id,
      title: PLAN.title,
      handle: PLAN.handle,
      descriptionHtml: PLAN.bodyHtmlEn,
      seo: { title: PLAN.seoTitle, description: PLAN.seoDesc },
      tags: newTags,
    },
  },
);
if (upd.productUpdate.userErrors.length) {
  console.log("  EN userErrors:", upd.productUpdate.userErrors);
} else {
  console.log(`  EN updated ✓ new handle: ${upd.productUpdate.product.handle}`);
}

// --- Update image alt text (via productUpdateMedia in API 2024-10) ---
if (imgsToUpdate.length) {
  const r = await gql(
    `mutation($productId: ID!, $media: [UpdateMediaInput!]!) {
      productUpdateMedia(productId: $productId, media: $media) {
        media { id alt }
        mediaUserErrors { field message }
      }
    }`,
    {
      productId: node.id,
      media: imgsToUpdate.map((im) => ({ id: im.id, alt: im.newAlt })),
    },
  );
  if (r.productUpdateMedia.mediaUserErrors.length) {
    console.log("  image userErrors:", r.productUpdateMedia.mediaUserErrors);
  } else {
    console.log(`  ${imgsToUpdate.length} image alts updated ✓`);
  }
}

// --- Update AR translations ---
const arPayload = [];
const push = (key, value) => {
  const en = enContent[key];
  if (!en?.digest) { console.log(`  AR skip ${key}: no digest`); return; }
  if (value && value !== arByKey[key]) {
    arPayload.push({ locale: "ar", key, value, translatableContentDigest: en.digest });
  }
};
push("title", PLAN.arTitle);
push("meta_title", PLAN.arMetaTitle);
push("meta_description", PLAN.arMetaDesc);
push("body_html", PLAN.bodyHtmlAr);

if (arPayload.length === 0) {
  console.log("  AR no changes");
} else {
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

// --- Create 301 redirect from old handle ---
const rd = await gql(
  `mutation($p: UrlRedirectInput!) {
    urlRedirectCreate(urlRedirect: $p) {
      urlRedirect { id path target }
      userErrors { field message }
    }
  }`,
  { p: { path: `/products/${OLD_HANDLE}`, target: `/products/${NEW_HANDLE}` } },
);
if (rd.urlRedirectCreate.userErrors.length) {
  const errs = rd.urlRedirectCreate.userErrors;
  if (errs.some((e) => /taken|exists|already/i.test(e.message))) {
    console.log("  redirect already exists (or Shopify auto-created)");
  } else {
    console.log("  redirect userErrors:", errs);
  }
} else {
  console.log(`  redirect created ✓ /products/${OLD_HANDLE} → /products/${NEW_HANDLE}`);
}

console.log("\nDone.");
