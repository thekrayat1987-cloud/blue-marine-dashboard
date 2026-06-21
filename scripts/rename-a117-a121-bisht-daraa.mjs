// Rename A117-A121 from "... Daraa 2-Piece Set" → "... Bisht & Daraa Set"
// Updates: title (EN+AR), seo.title (EN+AR), seo.description (EN+AR).
// Product type stays as-is (Khadija confirmed).
//
// Usage:
//   node --env-file=.env.local scripts/rename-a117-a121-bisht-daraa.mjs            # dry-run
//   node --env-file=.env.local scripts/rename-a117-a121-bisht-daraa.mjs --apply    # write
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

// Explicit per-product mapping (5 products, explicit is safer than regex).
const PLAN = {
  A117: {
    title:    "A117 – Mubarakiya Layered Bisht & Daraa Set",
    arTitle:  "A117 – مباركية طقم بشت ودرّاعة بطبقات",
    seoTitle: "Mubarakiya Layered Bisht & Daraa Set | Olive Embroidered Khaleeji | Atelier Blue Marine",
    arMetaTitle: "مباركية طقم بشت ودرّاعة | زيتوني مطرّز خليجي | أتيليه بلو مارين",
    seoDesc:  "Mubarakiya Layered Bisht & Daraa Set in olive with intricate embroidery. A Khaleeji ensemble for weddings and evenings. Atelier-made in Kuwait, ships across the Gulf.",
    arMetaDesc: "طقم بشت ودرّاعة مباركية باللون الزيتوني مع تطريز فني. طقم خليجي للأعراس والسهرات. صُنع في أتيليه بالكويت، توصيل لجميع دول الخليج.",
  },
  A118: {
    title:    "A118 – Dana Bisht & Daraa Set",
    arTitle:  "A118 – دانا طقم بشت ودرّاعة",
    seoTitle: "Dana Black Bisht & Daraa Set | Embroidered Khaleeji | Atelier Blue Marine",
    arMetaTitle: "دانة طقم بشت ودرّاعة أسود | مطرّز خليجي | أتيليه بلو مارين",
    seoDesc:  "Dana black bisht & daraa set with intricate bronze embroidery. Atelier-made in Kuwait for formal evenings and weddings across the Gulf.",
    arMetaDesc: "طقم دانة بشت ودرّاعة أسود بتطريز برونزي دقيق. صنع في أتيليه كويتي، مثالي للسهرات والأعراس في الخليج العربي.",
  },
  A119: {
    title:    "A119 – Munira Bisht & Daraa Set",
    arTitle:  "A119 – منيرة طقم بشت ودرّاعة",
    seoTitle: "Munira Bisht & Daraa Set | Embroidered Khaleeji | Atelier Blue Marine",
    arMetaTitle: "منيرة طقم بشت ودرّاعة | مطرّز خليجي | أتيليه بلو مارين",
    seoDesc:  "Munira black bisht & daraa set featuring an embroidered inner dress and matching bisht. Made-to-order in Kuwait, delivered across the Gulf for formal evenings and Eid.",
    arMetaDesc: "طقم منيرة بشت ودرّاعة الأسود مع درّاعة داخلية مطرّزة وبشت متناسق. صنع في الكويت، توصيل لكل دول الخليج للسهرات الرسمية والعيد.",
  },
  A120: {
    title:    "A120 – Lu'lu Bisht & Daraa Set",
    arTitle:  "A120 – لؤلؤ طقم بشت ودرّاعة",
    seoTitle: "Lu'lu Burgundy Bisht & Daraa Set | Velvet Khaleeji | Atelier Blue Marine",
    arMetaTitle: "طقم لؤلؤ بشت ودرّاعة | مخمل خليجي | أتيليه بلو مارين",
    seoDesc:  "Lu'lu bisht & daraa set featuring a burgundy embroidered daraa and black velvet bisht. Made-to-order in Kuwait for weddings and formal occasions across the Gulf.",
    arMetaDesc: "طقم لؤلؤ بشت ودرّاعة عنابّية مطرّزة وبشت مخمل أسود. صنع في أتيليه كويتي، مناسب للأعراس والمناسبات الرسمية في الخليج.",
  },
  A121: {
    title:    "A121 – Anqa Layered Bisht & Daraa Set",
    arTitle:  "A121 – عنقاء طقم بشت ودرّاعة بطبقات",
    seoTitle: "Anqa Bisht & Daraa Set | Layered Khaleeji Gown | Atelier Blue Marine",
    arMetaTitle: "طقم عنقاء بشت ودرّاعة | طبقات خليجي | أتيليه بلو مارين",
    seoDesc:  "Discover the Anqa bisht & daraa set, featuring intricate embroidery and a flowing layered silhouette. Atelier-made in Kuwait for weddings and evening events across the Gulf.",
    arMetaDesc: "اكتشفي طقم عنقاء بشت ودرّاعة، بتطريز دقيق وقصة انسيابية بطبقات. صنع في أتيليه كويتي للأعراس والمناسبات المسائية في الخليج.",
  },
};

for (const sku of Object.keys(PLAN)) {
  const plan = PLAN[sku];
  const d = await gql(
    `query($q: String!) { products(first: 5, query: $q) { edges { node {
      id title seo { title description }
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

  console.log("=".repeat(72));
  console.log(`[${sku}] ${node.id}`);
  console.log(`  EN title:    ${node.title}\n           → ${plan.title}`);
  console.log(`  AR title:    ${arByKey.title || "(none)"}\n           → ${plan.arTitle}`);
  console.log(`  SEO title:   ${node.seo?.title}\n           → ${plan.seoTitle}`);
  console.log(`  AR meta T:   ${arByKey.meta_title || "(none)"}\n           → ${plan.arMetaTitle}`);
  console.log(`  SEO desc:    ${node.seo?.description}\n           → ${plan.seoDesc}`);
  console.log(`  AR meta D:   ${arByKey.meta_description || "(none)"}\n           → ${plan.arMetaDesc}`);

  if (!APPLY) continue;

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
        id: node.id,
        title: plan.title,
        seo: { title: plan.seoTitle, description: plan.seoDesc },
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
    if (!en?.digest) { console.log(`  AR skip ${key}: no digest`); return; }
    if (value && value !== arByKey[key]) {
      arPayload.push({ locale: "ar", key, value, translatableContentDigest: en.digest });
    }
  };
  push("title", plan.arTitle);
  push("meta_title", plan.arMetaTitle);
  push("meta_description", plan.arMetaDesc);

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
