// Retry AR translations only (post-EN-update). Re-fetches fresh digests
// because productUpdate on title/seo invalidates the prior translatable
// content digest, breaking translationsRegister.
//
// Usage:
//   node --env-file=.env.local scripts/remove-printed-from-titles-ar-retry.mjs           # dry-run
//   node --env-file=.env.local scripts/remove-printed-from-titles-ar-retry.mjs --apply   # write
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

const AR_PLAN = {
  A34: {
    meta_title: "مرجان طقم بشت | مخمل أسود ودرّاعة منقوشة ٣ قطع | أتيليه بلو مارين",
    meta_description: "طقم بشت مرجان ٣ قطع يضم بشت مخملي أسود ودرّاعة منقوشة بلون الخردل وشال منسق. صنع في أتيليه الكويت للأعراس والسهرات والعيد، توصيل لكل دول الخليج.",
  },
  A43: {
    meta_title: "أميرة طقم بشت | مخمل منقوش ٤ قطع خليجي | أتيليه بلو مارين",
    meta_description: "طقم بشت أميرة ٤ قطع يتضمن بشت مخمل مع درّاعة داخلية منقوشة وشال. مثالي للسهرات الرسمية والأعياد. صنع في أتيليه كويتي، توصيل لكل دول الخليج.",
  },
  A58: {
    title: "A58 – مرجان درّاعة",
    meta_title: "درّاعة مرجان | تصميم أزرق تراثي بنقوش | أتيليه بلو مارين",
    meta_description: "درّاعة مرجان باللون الأزرق الداكن بنقوش بني محمر. صنع في الكويت للمناسبات الرسمية والأعياد في الخليج. تسوقي الآن.",
  },
  A59: {
    meta_description: "طقم بشت زمرد مخملي أخضر مع درّاعة منقوشة. صنع في أتيليه الكويت، توصيل لكل دول الخليج. للأعراس والسهرات والمناسبات الرسمية.",
  },
  A64: {
    meta_title: "درّاعة ضياء | درّاعة خليجية تراثية بنقوش | أتيليه بلو مارين",
    meta_description: "اكتشفي درّاعة ضياء، درّاعة خليجية انسيابية بنقش زهري مميز. صنع في أتيليه الكويت للمناسبات المسائية والعيد. تسوقي في السعودية والإمارات وقطر.",
  },
  A66: {
    title: "A66 – فلك درّاعة طقم ٢ قطع",
    meta_title: "طقم درّاعة فلك | درّاعة تراثية بنقوش متعددة الألوان | أتيليه بلو مارين",
    meta_description: "طقم درّاعة فلك بنقوش متعددة الألوان مع تطريز ذهبي. صنع حسب الطلب في الكويت، توصيل لجميع دول الخليج. مثالي للأعراس والسهرات والتجمعات الرسمية.",
  },
  A75: {
    meta_title: "زاريا درّاعة | قطعة واحدة فضفاضة بنقوش | أتيليه بلو مارين",
    meta_description: "درّاعة زاريا، درّاعة فضفاضة بنقوش بألوان ترابية دافئة مع أكمام واسعة وتفاصيل حدودية. صنع في الكويت، توصيل لدول الخليج للمناسبات والعيد.",
  },
  A77: {
    meta_title: "درّاعة بحر مخمل | بنقوش خليجية فاخرة | أتيليه بلو مارين",
  },
  A79: {
    meta_title: "درّاعة طرفة | بنقوش كحلية خليجية أنيقة | أتيليه بلو مارين",
    meta_description: "درّاعة طرفة باللون الكحلي مع أكمام خضراء ونقوش دقيقة. صنع في أتيليه الكويت للسهرات والتجمعات الرسمية في الخليج.",
  },
  A90: {
    title: "A90 – أصالة درّاعة",
    meta_title: "أصالة درّاعة | درّاعة خليجية فضفاضة بنقوش | أتيليه بلو مارين",
    meta_description: "درّاعة أصالة بقصة فضفاضة ونقوش فريدة. صنع في أتيليه كويتي، توصيل لكل دول الخليج للسهرات والأعياد.",
  },
  A93: {
    meta_title: "سهار درّاعة خضراء | قفطان شفاف بنقوش | أتيليه بلو مارين",
    meta_description: "اكتشفي درّاعة سهار، قفطان أخضر زمردي شفاف بنقوش. صنع في أتيليه الكويت لحفلات الزفاف والسهرات. تسوقي في جميع دول مجلس التعاون الخليجي.",
  },
  A99: {
    meta_description: "اكتشفي درّاعة سلوى، قطعة واحدة من المخمل والقماش المنقوش بتطريز ترتر دقيق. تُصنع حسب الطلب في الكويت لنساء الخليج، مثالية للأعراس، الأعياد، والتجمعات الرسمية في دول مجلس التعاون الخليجي.",
  },
  A122: {
    meta_title: "قفطان ليالي – نقوش أزرق وأحمر، أتيليه بلو مارين",
    meta_description: "قفطان بنقوش وتصميم أنيق يجمع بين الأزرق الداكن والأحمر. مثالي للجمعات العائلية واحتفالات العيد في الكويت. اكتشفي التراث الفاخر من أتيليه بلو مارين.",
  },
  A124: {
    title: "A124 – نور قفطان",
    meta_title: "قفطان نور – بنقوش كحلي، أتيليه بلو مارين",
    meta_description: "اكتشفي قفطان نور من القماش الكحلي الشفاف بنقوش عنابية وذهبية. قطعة فاخرة من أتيليه بلو مارين للأمسيات الخاصة، التجمعات، واحتفالات العيد في الكويت.",
  },
  A130: {
    meta_title: "قفطان سلطانة بنقوش – أتيليه بلو مارين",
  },
  A141: {
    meta_title: "طقم درّاعة زهيرة – أصفر بنقوش، أتيليه بلو مارين",
    meta_description: "طقم درّاعة أنيق من قطعتين باللون الأصفر بنقوش مع شال مفتوح مطابق. يتميز بتطريز ذهبي على العنق. مثالي للأمسيات الرسمية والعيد في الكويت.",
  },
  A148: {
    meta_title: "درّاعة طريفة – شيفون بنقوش أحمر، أتيليه بلو مارين",
    meta_description: "درّاعة شيفون بنقوش باللونين الأحمر والأبيض وتطريز على فتحة العنق. مثالية للعيد والمناسبات الخاصة والتجمعات العائلية من أتيليه بلو مارين في الكويت.",
  },
  A150: {
    meta_description: "درّاعة شيفون بنقوش باللونين الفوشيا والوردي مع ياقة مطرزة. مثالية للسهرات والأعياد والمناسبات الخاصة. اكتشفي التراث الخليجي الفاخر من أتيليه بلو مارين.",
  },
  A151: {
    meta_title: "درّاعة شيفون بنقوش يارا – أتيليه بلو مارين",
    meta_description: "درّاعة شيفون بنقوش باللون البني والأبيض مع ياقة V مطرزة. مثالية للتجمعات العائلية والعيد والمناسبات الخاصة في الكويت.",
  },
};

let ok = 0, fail = 0, skipped = 0;

for (const sku of Object.keys(AR_PLAN)) {
  const plan = AR_PLAN[sku];
  const d = await gql(
    `query($q: String!) { products(first: 5, query: $q) { edges { node {
      id title
    } } } }`,
    { q: `title:${sku}*` },
  );
  const node = d.products.edges.find((e) => e.node.title.startsWith(`${sku} `))?.node;
  if (!node) { console.log(`[${sku}] not found`); fail++; continue; }

  // FRESH fetch of digests after EN update
  const t = await gql(
    `query($id: ID!) { translatableResource(resourceId: $id) {
      translatableContent { key value digest }
      translations(locale: "ar") { key value }
    } }`,
    { id: node.id },
  );
  const enContent = Object.fromEntries(t.translatableResource.translatableContent.map((c) => [c.key, c]));
  const arByKey = Object.fromEntries(t.translatableResource.translations.map((x) => [x.key, x.value]));

  const payload = [];
  for (const [key, value] of Object.entries(plan)) {
    const en = enContent[key];
    if (!en?.digest) { console.log(`[${sku}] skip ${key}: no digest`); continue; }
    if (value === arByKey[key]) continue; // already correct
    payload.push({ locale: "ar", key, value, translatableContentDigest: en.digest });
  }

  if (payload.length === 0) {
    console.log(`[${sku}] AR already up-to-date`);
    skipped++;
    continue;
  }

  console.log(`[${sku}] pushing AR keys: ${payload.map((p) => p.key).join(", ")}`);
  if (!APPLY) continue;

  const ar = await gql(
    `mutation($id: ID!, $t: [TranslationInput!]!) {
      translationsRegister(resourceId: $id, translations: $t) {
        translations { key }
        userErrors { field message }
      }
    }`,
    { id: node.id, t: payload },
  );
  if (ar.translationsRegister.userErrors.length) {
    console.log(`  [${sku}] userErrors:`, ar.translationsRegister.userErrors);
    fail++;
  } else {
    console.log(`  [${sku}] AR registered ${ar.translationsRegister.translations.length}/${payload.length} ✓`);
    ok++;
  }
}

console.log("\n" + "=".repeat(72));
console.log(APPLY
  ? `Done. AR success: ${ok}, AR fail: ${fail}, AR skipped (already correct): ${skipped}.`
  : `Dry-run only — re-run with --apply to write.`);
