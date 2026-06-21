// AR-only follow-up for A117-A121 rename (EN was already applied).
// Re-fetches fresh translatable content digests, then writes AR title/meta_title/meta_description.
//
// Usage:
//   node --env-file=.env.local scripts/rename-a117-a121-ar-only.mjs            # dry-run
//   node --env-file=.env.local scripts/rename-a117-a121-ar-only.mjs --apply    # write
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

const PLAN = {
  A117: {
    arTitle:     "A117 – مباركية طقم بشت ودرّاعة بطبقات",
    arMetaTitle: "مباركية طقم بشت ودرّاعة | زيتوني مطرّز خليجي | أتيليه بلو مارين",
    arMetaDesc:  "طقم بشت ودرّاعة مباركية باللون الزيتوني مع تطريز فني. طقم خليجي للأعراس والسهرات. صُنع في أتيليه بالكويت، توصيل لجميع دول الخليج.",
  },
  A118: {
    arTitle:     "A118 – دانا طقم بشت ودرّاعة",
    arMetaTitle: "دانة طقم بشت ودرّاعة أسود | مطرّز خليجي | أتيليه بلو مارين",
    arMetaDesc:  "طقم دانة بشت ودرّاعة أسود بتطريز برونزي دقيق. صنع في أتيليه كويتي، مثالي للسهرات والأعراس في الخليج العربي.",
  },
  A119: {
    arTitle:     "A119 – منيرة طقم بشت ودرّاعة",
    arMetaTitle: "منيرة طقم بشت ودرّاعة | مطرّز خليجي | أتيليه بلو مارين",
    arMetaDesc:  "طقم منيرة بشت ودرّاعة الأسود مع درّاعة داخلية مطرّزة وبشت متناسق. صنع في الكويت، توصيل لكل دول الخليج للسهرات الرسمية والعيد.",
  },
  A120: {
    arTitle:     "A120 – لؤلؤ طقم بشت ودرّاعة",
    arMetaTitle: "طقم لؤلؤ بشت ودرّاعة | مخمل خليجي | أتيليه بلو مارين",
    arMetaDesc:  "طقم لؤلؤ بشت ودرّاعة عنابّية مطرّزة وبشت مخمل أسود. صنع في أتيليه كويتي، مناسب للأعراس والمناسبات الرسمية في الخليج.",
  },
  A121: {
    arTitle:     "A121 – عنقاء طقم بشت ودرّاعة بطبقات",
    arMetaTitle: "طقم عنقاء بشت ودرّاعة | طبقات خليجي | أتيليه بلو مارين",
    arMetaDesc:  "اكتشفي طقم عنقاء بشت ودرّاعة، بتطريز دقيق وقصة انسيابية بطبقات. صنع في أتيليه كويتي للأعراس والمناسبات المسائية في الخليج.",
  },
};

for (const sku of Object.keys(PLAN)) {
  const plan = PLAN[sku];
  const d = await gql(
    `query($q: String!) { products(first: 5, query: $q) { edges { node { id title } } } }`,
    { q: `title:${sku}*` },
  );
  const node = d.products.edges.find((e) => e.node.title.startsWith(`${sku} `))?.node;
  if (!node) { console.log(`[${sku}] not found`); continue; }

  // Fresh digest fetch after EN update
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
  console.log(`[${sku}] ${node.title}`);
  console.log(`  AR title:    ${arByKey.title || "(none)"}\n           → ${plan.arTitle}`);
  console.log(`  AR meta T:   ${arByKey.meta_title || "(none)"}\n           → ${plan.arMetaTitle}`);
  console.log(`  AR meta D:   ${arByKey.meta_description || "(none)"}\n           → ${plan.arMetaDesc}`);

  if (!APPLY) continue;

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
