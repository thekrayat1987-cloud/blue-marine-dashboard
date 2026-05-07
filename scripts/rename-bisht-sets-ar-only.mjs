// Push AR translations for A125/A126/A127 after EN side already renamed.
// Fetches FRESH digests (post EN update) before translationsRegister.
const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
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

// Targets: explicit AR replacements per product
const TARGETS = {
  A125: {
    title: "A125 – بندر طقم بشت ٣ قطع",
    meta_title: "طقم بشت بندر – نقشات تراثية، أتيليه بلو مارين",
    meta_description:
      "طقم بشت من ثلاث قطع ببشت خارجي أسود ودرّاعة داخلية مخططة وشال مطابق. يتميز بنقوش تراثية. مثالي للمناسبات الرسمية أو احتفالات العيد في الكويت.",
    body_html:
      "<p>طقم من ثلاث قطع يضم بشت أسود مفتوح بأساور مزخرفة. يأتي مع درّاعة داخلية مخططة وشال مطابق.</p><p>تظهر الدرّاعة الداخلية والشال خطوطًا عمودية جريئة باللون الأحمر والأزرق والبيج، تكملها نقوش هندسية دقيقة. تتكرر هذه الأنماط التراثية على حواف أكمام البشت.</p><p>مثالي للمناسبات الخاصة والاحتفالات الرسمية أو أعياد الكويت. يوفر مزيج الأقمشة الراحة والانسيابية.</p>",
  },
  A126: {
    title: "A126 – ريم طقم بشت ٣ قطع",
    meta_title: "طقم بشت ريم – درّاعة منقوشة، أتيليه بلو مارين",
    meta_description:
      "طقم بشت من ثلاث قطع، يتضمن بشت أسود ودرّاعة منقوشة مع شال مطابق. مثالي للأمسيات الرسمية والمناسبات الخاصة في الكويت.",
    body_html:
      "<p>يتكوّن هذا الطقم ثلاثي القطع من بشت أسود كلاسيكي يُلبس فوق درّاعة داخلية منقوشة. يكمل شال مطابق هذه المجموعة المنسقة.</p><p>الدرّاعة الداخلية مصنوعة من قماش ناعم بنقش هندسي لافت باللونين الأسود والأبيض المائل للصفرة، مع لمسات حمراء خفيفة. يمتدّ هذا النقش التراثي إلى الشال المطابق وأطراف أكمام البشت الداخلي.</p><p>مثالي للمناسبات العائلية والأعياد أو الأمسيات الرسمية. يوفر هذا الطقم الراحة والأناقة الخليجية التقليدية.</p>",
  },
  A127: {
    title: "A127 – ليلى طقم بشت ٣ قطع",
    meta_title: "طقم بشت ليلى أسود – أتيليه بلو مارين",
    meta_description:
      "طقم بشت أسود من ثلاث قطع مع درّاعة داخلية مطبوعة وشال مطابق. مثالي للمناسبات المسائية الرسمية، الأعياد، أو التجمعات الخاصة. تصميم أتيليه بلو مارين.",
    body_html:
      "<p>يتكون هذا الطقم من ثلاث قطع من بشت أسود مفتوح فوق درّاعة داخلية مطبوعة. يوفر القماش الأسود الغني قاعدة كلاسيكية للأنماط الزاهية.</p><p>تعرض الدرّاعة الداخلية وأكمام البشت والشال المطابق طبعة غنية من الزهور والأنماط الهندسية بألوان دافئة. يضيف تقليم ذهبي لامع لمسة على الفتحة الأمامية وحواف الشال.</p><p>مثالي للمناسبات المسائية الرسمية واحتفالات العيد أو التجمعات الخاصة في الكويت. توفر الأقمشة خفيفة الوزن ارتداءً مريحًا.</p>",
  },
};

for (const [sku, ar] of Object.entries(TARGETS)) {
  const found = await gql(
    `query($q: String!) { products(first: 5, query: $q) { edges { node { id title } } } }`,
    { q: `title:${sku}*` },
  );
  const node = found.products.edges.find((e) => e.node.title.startsWith(`${sku} `))?.node;
  if (!node) { console.log(`[${sku}] not found`); continue; }

  // Fetch FRESH digests for the (already-updated) EN content
  const t = await gql(
    `query($id: ID!) { translatableResource(resourceId: $id) {
      translatableContent { key value digest }
    } }`,
    { id: node.id },
  );
  const enByKey = Object.fromEntries(t.translatableResource.translatableContent.map((c) => [c.key, c]));

  const payload = [];
  for (const key of ["title", "body_html", "meta_title", "meta_description"]) {
    const en = enByKey[key];
    if (!en?.digest) { console.log(`  [${sku}] no EN digest for ${key}`); continue; }
    payload.push({ locale: "ar", key, value: ar[key], translatableContentDigest: en.digest });
  }

  const res = await gql(
    `mutation($id: ID!, $t: [TranslationInput!]!) {
      translationsRegister(resourceId: $id, translations: $t) {
        translations { key }
        userErrors { field message }
      }
    }`,
    { id: node.id, t: payload },
  );
  if (res.translationsRegister.userErrors.length) {
    console.log(`[${sku}] AR ERRORS:`, res.translationsRegister.userErrors);
  } else {
    console.log(`[${sku}] AR registered ${res.translationsRegister.translations.length}/${payload.length} ✓`);
  }
}
console.log("Done.");
