// Remove the word "Layered" (EN) and "بطبقات / طبقات" (AR) from A121 only.
// Updates: title (EN+AR), seo.title (EN+AR), seo.description (EN+AR).
// Handle is intentionally NOT changed (preserve SEO/redirects).
//
// Usage:
//   node --env-file=.env.local scripts/remove-a121-layered.mjs            # dry-run
//   node --env-file=.env.local scripts/remove-a121-layered.mjs --apply    # write
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
  A121: {
    title:       "A121 – Anqa Bisht & Daraa Set",
    arTitle:     "A121 – عنقاء طقم بشت ودرّاعة",
    seoTitle:    "Anqa Bisht & Daraa Set | Khaleeji Gown | Atelier Blue Marine",
    arMetaTitle: "طقم عنقاء بشت ودرّاعة | خليجي | أتيليه بلو مارين",
    seoDesc:     "Discover the Anqa bisht & daraa set, featuring intricate embroidery and a flowing silhouette. Atelier-made in Kuwait for weddings and evening events across the Gulf.",
    arMetaDesc:  "اكتشفي طقم عنقاء بشت ودرّاعة، بتطريز دقيق وقصة انسيابية. صنع في أتيليه كويتي للأعراس والمناسبات المسائية في الخليج.",
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

  // Re-fetch digests AFTER EN write (memory: digests go stale on EN write)
  const t2 = await gql(
    `query($id: ID!) { translatableResource(resourceId: $id) {
      translatableContent { key value digest }
    } }`,
    { id: node.id },
  );
  const enContent2 = Object.fromEntries(t2.translatableResource.translatableContent.map((c) => [c.key, c]));

  const arPayload = [];
  const push = (key, value) => {
    const en = enContent2[key];
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
