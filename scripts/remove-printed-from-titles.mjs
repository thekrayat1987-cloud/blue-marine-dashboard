// Strip "Printed" / "مطبوع/ة" from product TITLES, SEO meta titles, and
// SEO meta descriptions across 23 products. EN replacement = "Patterned"
// (or dropped when redundant); AR replacement = "بنقوش" (or "منقوش/ة").
//
// Usage:
//   node --env-file=.env.local scripts/remove-printed-from-titles.mjs           # dry-run
//   node --env-file=.env.local scripts/remove-printed-from-titles.mjs --apply   # write
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

// Per-SKU explicit rewrites. Each field optional — omit to leave unchanged.
const PLAN = {
  A34: {
    enSeoTitle: "Marjan Bisht Set | Black Velvet & Mustard Daraa 3-Piece | Atelier Blue Marine",
    arSeoTitle: "مرجان طقم بشت | مخمل أسود ودرّاعة منقوشة ٣ قطع | أتيليه بلو مارين",
    enSeoDesc:  "Marjan 3-piece bisht set with black velvet bisht, mustard patterned daraa, and matching scarf. Atelier-made in Kuwait for weddings, evenings, and Eid, delivered across the Gulf.",
    arSeoDesc:  "طقم بشت مرجان ٣ قطع يضم بشت مخملي أسود ودرّاعة منقوشة بلون الخردل وشال منسق. صنع في أتيليه الكويت للأعراس والسهرات والعيد، توصيل لكل دول الخليج.",
  },
  A43: {
    arSeoTitle: "أميرة طقم بشت | مخمل منقوش ٤ قطع خليجي | أتيليه بلو مارين",
    arSeoDesc:  "طقم بشت أميرة ٤ قطع يتضمن بشت مخمل مع درّاعة داخلية منقوشة وشال. مثالي للسهرات الرسمية والأعياد. صنع في أتيليه كويتي، توصيل لكل دول الخليج.",
  },
  A55: {
    enSeoTitle: "Marjan Daraa | Patterned 2-Piece Khaleeji Set | Atelier Blue Marine",
  },
  A58: {
    enTitle:    "A58 – Marjan Daraa",
    arTitle:    "A58 – مرجان درّاعة",
    enSeoTitle: "Marjan Daraa | Blue Patterned Heritage Gown | Atelier Blue Marine",
    arSeoTitle: "درّاعة مرجان | تصميم أزرق تراثي بنقوش | أتيليه بلو مارين",
    enSeoDesc:  "Marjan daraa in deep blue with reddish-brown motifs. Atelier-made in Kuwait for formal gatherings and Eid across the GCC. Shop online.",
    arSeoDesc:  "درّاعة مرجان باللون الأزرق الداكن بنقوش بني محمر. صنع في الكويت للمناسبات الرسمية والأعياد في الخليج. تسوقي الآن.",
  },
  A59: {
    enSeoDesc:  "Haya Emerald velvet bisht set with patterned daraa. Made-to-order in Kuwait, delivered across the Gulf. For weddings, evenings, and formal gatherings.",
    arSeoDesc:  "طقم بشت زمرد مخملي أخضر مع درّاعة منقوشة. صنع في أتيليه الكويت، توصيل لكل دول الخليج. للأعراس والسهرات والمناسبات الرسمية.",
  },
  A64: {
    enTitle:    "A64 – Diya Daraa",
    enSeoTitle: "Diya Daraa | Patterned Khaleeji Heritage Gown | Atelier Blue Marine",
    arSeoTitle: "درّاعة ضياء | درّاعة خليجية تراثية بنقوش | أتيليه بلو مارين",
    enSeoDesc:  "Discover the Diya Daraa, a flowing Khaleeji gown with a unique floral print. Atelier-made in Kuwait for evening events and Eid. Shop across Saudi, UAE, Qatar.",
    arSeoDesc:  "اكتشفي درّاعة ضياء، درّاعة خليجية انسيابية بنقش زهري مميز. صنع في أتيليه الكويت للمناسبات المسائية والعيد. تسوقي في السعودية والإمارات وقطر.",
  },
  A66: {
    enTitle:    "A66 – Falak Daraa 2-Piece Set",
    arTitle:    "A66 – فلك درّاعة طقم ٢ قطع",
    enSeoTitle: "Falak Daraa Set | Multi-Hued Patterned Heritage Gown | Atelier Blue Marine",
    arSeoTitle: "طقم درّاعة فلك | درّاعة تراثية بنقوش متعددة الألوان | أتيليه بلو مارين",
    enSeoDesc:  "Falak patterned daraa set in multi-hues with gold embroidery. Made-to-order in Kuwait, delivered across the GCC. Perfect for weddings, evenings, and formal gatherings.",
    arSeoDesc:  "طقم درّاعة فلك بنقوش متعددة الألوان مع تطريز ذهبي. صنع حسب الطلب في الكويت، توصيل لجميع دول الخليج. مثالي للأعراس والسهرات والتجمعات الرسمية.",
  },
  A75: {
    enSeoTitle: "Zaria Daraa | Patterned Flowing Single Piece | Atelier Blue Marine",
    arSeoTitle: "زاريا درّاعة | قطعة واحدة فضفاضة بنقوش | أتيليه بلو مارين",
    enSeoDesc:  "Zaria Daraa, a flowing patterned gown in warm terracotta tones with bell sleeves and border details. Made-to-order in Kuwait, delivered across the Gulf for gatherings and Eid.",
    arSeoDesc:  "درّاعة زاريا، درّاعة فضفاضة بنقوش بألوان ترابية دافئة مع أكمام واسعة وتفاصيل حدودية. صنع في الكويت، توصيل لدول الخليج للمناسبات والعيد.",
  },
  A77: {
    enSeoTitle: "Bahar Velvet Daraa | Patterned Khaleeji Gown | Atelier Blue Marine",
    arSeoTitle: "درّاعة بحر مخمل | بنقوش خليجية فاخرة | أتيليه بلو مارين",
  },
  A79: {
    enSeoTitle: "Tarfa Daraa | Patterned Navy Khaleeji Gown | Atelier Blue Marine",
    arSeoTitle: "درّاعة طرفة | بنقوش كحلية خليجية أنيقة | أتيليه بلو مارين",
    enSeoDesc:  "Tarfa patterned daraa in navy with green sleeves and intricate patterns. Made-to-order in Kuwait for evening and formal gatherings across the Gulf.",
    arSeoDesc:  "درّاعة طرفة باللون الكحلي مع أكمام خضراء ونقوش دقيقة. صنع في أتيليه الكويت للسهرات والتجمعات الرسمية في الخليج.",
  },
  A80: {
    enSeoDesc:  "Ghazal Velvet bisht set with an embroidered daraa and a flowing patterned bisht. Made-to-order in Kuwait, delivered across the Gulf. For weddings and formal evenings.",
  },
  A90: {
    enTitle:    "A90 – Asala Daraa",
    arTitle:    "A90 – أصالة درّاعة",
    enSeoTitle: "Asala Daraa | Flowing Patterned Khaleeji Gown | Atelier Blue Marine",
    arSeoTitle: "أصالة درّاعة | درّاعة خليجية فضفاضة بنقوش | أتيليه بلو مارين",
    enSeoDesc:  "Asala daraa in a flowing silhouette with a unique pattern. Made-to-order in Kuwait, delivered across the Gulf for evenings and Eid.",
    arSeoDesc:  "درّاعة أصالة بقصة فضفاضة ونقوش فريدة. صنع في أتيليه كويتي، توصيل لكل دول الخليج للسهرات والأعياد.",
  },
  A93: {
    enSeoTitle: "Asalah Green Daraa | Sheer Patterned Gown | Atelier Blue Marine",
    arSeoTitle: "سهار درّاعة خضراء | قفطان شفاف بنقوش | أتيليه بلو مارين",
    enSeoDesc:  "Discover the Asalah Daraa, a sheer emerald green patterned gown. Atelier-made in Kuwait for weddings and evening events. Shop across the GCC.",
    arSeoDesc:  "اكتشفي درّاعة سهار، قفطان أخضر زمردي شفاف بنقوش. صنع في أتيليه الكويت لحفلات الزفاف والسهرات. تسوقي في جميع دول مجلس التعاون الخليجي.",
  },
  A99: {
    enSeoDesc:  "Discover the Salwa Daraa, a single-piece velvet and patterned daraa with intricate sequin embroidery. Made-to-order in Kuwait for Khaleeji women, perfect for weddings, Eid, and formal gatherings across the GCC.",
    arSeoDesc:  "اكتشفي درّاعة سلوى، قطعة واحدة من المخمل والقماش المنقوش بتطريز ترتر دقيق. تُصنع حسب الطلب في الكويت لنساء الخليج، مثالية للأعراس، الأعياد، والتجمعات الرسمية في دول مجلس التعاون الخليجي.",
  },
  A122: {
    enSeoTitle: "Caftan Layali – Blue Patterned, Atelier Blue Marine",
    arSeoTitle: "قفطان ليالي – نقوش أزرق وأحمر، أتيليه بلو مارين",
    enSeoDesc:  "Flowing patterned caftan in deep blue and red patterns, featuring a tie-neck and wide sleeves. Perfect for Eid and special occasions. Discover luxury Gulf heritage at Atelier Blue Marine.",
    arSeoDesc:  "قفطان بنقوش وتصميم أنيق يجمع بين الأزرق الداكن والأحمر. مثالي للجمعات العائلية واحتفالات العيد في الكويت. اكتشفي التراث الفاخر من أتيليه بلو مارين.",
  },
  A124: {
    enTitle:    "A124 – Noor Caftan",
    arTitle:    "A124 – نور قفطان",
    enSeoTitle: "Caftan Noor – Patterned Navy, Atelier Blue Marine",
    arSeoTitle: "قفطان نور – بنقوش كحلي، أتيليه بلو مارين",
    enSeoDesc:  "Discover the Noor patterned caftan in sheer navy fabric with maroon and gold patterns. A luxurious piece by Atelier Blue Marine for special evenings, gatherings, and Eid in Kuwait.",
    arSeoDesc:  "اكتشفي قفطان نور من القماش الكحلي الشفاف بنقوش عنابية وذهبية. قطعة فاخرة من أتيليه بلو مارين للأمسيات الخاصة، التجمعات، واحتفالات العيد في الكويت.",
  },
  A130: {
    enSeoTitle: "Caftan Sultana Patterned – Atelier Blue Marine",
    arSeoTitle: "قفطان سلطانة بنقوش – أتيليه بلو مارين",
  },
  A141: {
    arSeoTitle: "طقم درّاعة زهيرة – أصفر بنقوش، أتيليه بلو مارين",
    arSeoDesc:  "طقم درّاعة أنيق من قطعتين باللون الأصفر بنقوش مع شال مفتوح مطابق. يتميز بتطريز ذهبي على العنق. مثالي للأمسيات الرسمية والعيد في الكويت.",
  },
  A142: {
    enSeoTitle: "Daraa Bayan – Patterned Peach, Atelier Blue Marine",
  },
  A147: {
    enSeoTitle: "Daraa Maha – Patterned Bell Sleeve, Atelier Blue Marine",
  },
  A148: {
    enSeoTitle: "Daraa Tareefa – Red Patterned Chiffon, Atelier Blue Marine",
    arSeoTitle: "درّاعة طريفة – شيفون بنقوش أحمر، أتيليه بلو مارين",
    enSeoDesc:  "Red and white patterned chiffon daraa with an embroidered V-neckline. Ideal for Eid, special occasions, and family gatherings in Kuwait by Atelier Blue Marine.",
    arSeoDesc:  "درّاعة شيفون بنقوش باللونين الأحمر والأبيض وتطريز على فتحة العنق. مثالية للعيد والمناسبات الخاصة والتجمعات العائلية من أتيليه بلو مارين في الكويت.",
  },
  A150: {
    enSeoDesc:  "Flowing fuchsia and pink patterned chiffon daraa with embroidered V-neckline. Perfect for evenings, Eid, and special occasions. Discover luxury Gulf heritage from Atelier Blue Marine.",
    arSeoDesc:  "درّاعة شيفون بنقوش باللونين الفوشيا والوردي مع ياقة مطرزة. مثالية للسهرات والأعياد والمناسبات الخاصة. اكتشفي التراث الخليجي الفاخر من أتيليه بلو مارين.",
  },
  A151: {
    enSeoTitle: "Patterned Chiffon Daraa Yara – Atelier Blue Marine",
    arSeoTitle: "درّاعة شيفون بنقوش يارا – أتيليه بلو مارين",
    enSeoDesc:  "Light brown and white patterned chiffon daraa with embroidered V-neck. Perfect for family gatherings, Eid, and special occasions in Kuwait.",
    arSeoDesc:  "درّاعة شيفون بنقوش باللون البني والأبيض مع ياقة V مطرزة. مثالية للتجمعات العائلية والعيد والمناسبات الخاصة في الكويت.",
  },
};

let updated = 0, errors = 0;

for (const sku of Object.keys(PLAN)) {
  const plan = PLAN[sku];
  const d = await gql(
    `query($q: String!) { products(first: 5, query: $q) { edges { node {
      id title seo { title description }
    } } } }`,
    { q: `title:${sku}*` },
  );
  const node = d.products.edges.find((e) => e.node.title.startsWith(`${sku} `))?.node;
  if (!node) { console.log(`[${sku}] not found`); errors++; continue; }
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
  if (plan.enTitle)    console.log(`  EN title:    ${node.title}\n           → ${plan.enTitle}`);
  if (plan.arTitle)    console.log(`  AR title:    ${arByKey.title || "(none)"}\n           → ${plan.arTitle}`);
  if (plan.enSeoTitle) console.log(`  EN seo T:    ${node.seo?.title || "(none)"}\n           → ${plan.enSeoTitle}`);
  if (plan.arSeoTitle) console.log(`  AR seo T:    ${arByKey.meta_title || "(none)"}\n           → ${plan.arSeoTitle}`);
  if (plan.enSeoDesc)  console.log(`  EN seo D:    ${node.seo?.description || "(none)"}\n           → ${plan.enSeoDesc}`);
  if (plan.arSeoDesc)  console.log(`  AR seo D:    ${arByKey.meta_description || "(none)"}\n           → ${plan.arSeoDesc}`);

  if (!APPLY) continue;

  // ----- EN update -----
  const enInput = { id: node.id };
  if (plan.enTitle) enInput.title = plan.enTitle;
  if (plan.enSeoTitle || plan.enSeoDesc) {
    enInput.seo = {
      title: plan.enSeoTitle ?? node.seo?.title ?? "",
      description: plan.enSeoDesc ?? node.seo?.description ?? "",
    };
  }
  if (enInput.title || enInput.seo) {
    const upd = await gql(
      `mutation($p: ProductInput!) {
        productUpdate(input: $p) {
          product { id }
          userErrors { field message }
        }
      }`,
      { p: enInput },
    );
    if (upd.productUpdate.userErrors.length) {
      console.log("  EN userErrors:", upd.productUpdate.userErrors);
      errors++;
    } else {
      console.log("  EN updated ✓");
    }
  }

  // ----- AR translations -----
  const arPayload = [];
  const push = (key, value) => {
    const en = enContent[key];
    if (!en?.digest) { console.log(`  AR skip ${key}: no digest`); return; }
    if (value && value !== arByKey[key]) {
      arPayload.push({ locale: "ar", key, value, translatableContentDigest: en.digest });
    }
  };
  if (plan.arTitle)    push("title", plan.arTitle);
  if (plan.arSeoTitle) push("meta_title", plan.arSeoTitle);
  if (plan.arSeoDesc)  push("meta_description", plan.arSeoDesc);

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
      errors++;
    } else {
      console.log(`  AR registered ${ar.translationsRegister.translations.length}/${arPayload.length} ✓`);
    }
  }
  updated++;
}

console.log("\n" + "=".repeat(72));
console.log(APPLY
  ? `Done. Updated ${updated}/${Object.keys(PLAN).length} products. Errors: ${errors}.`
  : `Dry-run only — ${Object.keys(PLAN).length} products planned. Re-run with --apply to write.`);
