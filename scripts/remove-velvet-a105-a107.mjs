#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const URL_ = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${process.env.SHOPIFY_API_VERSION || "2024-10"}/graphql.json`;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

async function gql(q, v = {}) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query: q, variables: v }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const DRY = process.argv.includes("--dry");

const PRODUCTS = [
  {
    id: "gid://shopify/Product/10272947667244",
    label: "A107 Refal",
    en: {
      title: "A107 – Refal Daraa",
      seoTitle: "Refal Daraa | Plum Dotted Embroidery | Atelier Blue Marine",
      seoDescription:
        "Refal Deep Plum Daraa with dotted pattern and intricate embroidery. Made-to-order in Kuwait, delivered across the Gulf for evenings and special occasions.",
      descriptionHtml:
        "<p>Sahar, named for the dawn, captures the quiet beauty of early light in a deep plum daraa. This piece offers a flowing, relaxed silhouette, designed for effortless presence.</p>\n<p>The rich fabric is patterned with delicate, horizontal dotted lines in a subtle beige, creating visual movement. Wide sleeves feature intricate embroidery at the cuffs, mirrored by a substantial border along the hem. Each Sahar daraa is atelier-made in Kuwait, reflecting precise Khaleeji craft.</p>\n<p>Wear Sahar for formal gatherings, intimate family dinners, or special Eid celebrations. Its comfortable elegance makes it an ideal choice for women across the Gulf seeking heritage with a contemporary cut.</p>\n\n<!-- gmc-enriched:start -->\n<h3>Product details</h3>\n<ul>\n<li>\n<strong>Colors:</strong> Plum</li>\n<li>\n<strong>Sizes:</strong> XS – 3XL</li>\n<li>\n<strong>Material:</strong> Cotton, Silk</li>\n<li>\n<strong>Pattern:</strong> Embroidered</li>\n</ul>\n<!-- gmc-enriched:end -->",
      tagsRemove: ["velvet-daraa", "velvet"],
    },
    ar: {
      title: "A107 – رفال درّاعة",
      meta_title: "درّاعة رفال | عنابي بتطريز منقط | أتيليه بلو مارين",
      meta_description:
        "درّاعة رفال بلون عنابي عميق بنقش منقط وتطريز دقيق. تُصنع حسب الطلب في الكويت، توصيل لكل دول الخليج للسهرات والمناسبات.",
      body_html:
        "<p>درّاعة سحر، سميت تيمناً بجمال الفجر الهادئ، تتجلى بلون عنابي عميق. تتميز هذه الدرّاعة بقصّة فضفاضة وانسيابية، مصممة للمسة راقية بلا مجهود.</p>\n<p>يزدان النسيج الغني بنقوش خطوط متقطعة أفقية دقيقة بلون بيج ناعم، مما يضيف حركة بصرية. الأكمام الواسعة مزينة بتطريز دقيق عند الأطراف، يتكرر بنمط مماثل على طول الحافة السفلية. كل درّاعة سحر تُصنع في أتيليه الكويت، تجسيداً للحرفية الخليجية الأصيلة.</p>\n<p>ارتدي سحر للمناسبات الرسمية، العشاء العائلي، أو احتفالات الأعياد الخاصة. أناقتها المريحة تجعلها الخيار الأمثل للمرأة الخليجية التي تبحث عن الأصالة بلمسة عصرية.</p>\n\n<!-- gmc-enriched:start -->\n<h3>تفاصيل المنتج</h3>\n<ul>\n<li><strong>الألوان:</strong> بنفسجي داكن</li>\n<li><strong>المقاسات:</strong> XS – 3XL</li>\n<li><strong>مادة الصنع:</strong> قطن، حرير</li>\n<li><strong>النقش:</strong> مطرّز</li>\n</ul>\n<!-- gmc-enriched:end -->",
    },
  },
  {
    id: "gid://shopify/Product/10272944259372",
    label: "A105 Anoud",
    en: {
      title: "A105 – Anoud Daraa",
      seoTitle: "Anoud Daraa | Burgundy Gold Trim | Atelier Blue Marine",
      seoDescription:
        "Anoud burgundy daraa with elegant gold trim details. Made-to-order in Kuwait for formal gatherings, Eid, and evening events across the Gulf. Shop online.",
      descriptionHtml:
        "<p>Sahar takes its name from the Arabic word for dawn, expressed in a deep burgundy daraa that flows with quiet grace. Its generous, full-length silhouette offers comfort and a refined presence.</p>\n<p>This daraa features delicate gold piping outlining the round neckline and extending down the front placket with matching gold buttons. Wide bell sleeves and subtle side slits at the hem are also finished with gold trim, showcasing Atelier Blue Marine's Kuwaiti craftsmanship.</p>\n<p>An ideal choice for formal gatherings, Eid celebrations, or special evening events across the Gulf. This daraa pairs effortlessly with gold jewellery, for the woman who values heritage with a contemporary cut.</p>\n\n<!-- gmc-enriched:start -->\n<h3>Product details</h3>\n<ul>\n<li>\n<strong>Colors:</strong> Red, White, Black, Burgundy</li>\n<li>\n<strong>Sizes:</strong> XS – 3XL</li>\n<li>\n<strong>Material:</strong> Cotton, Silk</li>\n<li>\n<strong>Pattern:</strong> Solid</li>\n</ul>\n<!-- gmc-enriched:end -->",
      tagsRemove: ["velvet", "velvet-daraa"],
    },
    ar: {
      title: "A105 – العنود درّاعة",
      meta_title: "العنود درّاعة | عنابي بتقليم ذهبي | أتيليه بلو مارين",
      meta_description:
        "درّاعة العنود العنابية بتفاصيل تقليم ذهبي أنيقة. مصنوعة حسب الطلب في الكويت للمناسبات الرسمية والأعياد والسهرات في الخليج. تسوقي الآن.",
      body_html:
        "<p>سحر، المستوحاة من كلمة الفجر العربية، تتجلى في درّاعة عنابية عميقة تتدفق برشاقة هادئة. قصتها الواسعة والطويلة توفر الراحة والحضور الراقي.</p>\n<p>تتميز هذه الدرّاعة بتقليم ذهبي دقيق يحدد خط العنق المستدير ويمتد على طول فتحة الصدر بأزرار ذهبية متناسقة. الأكمام الواسعة والشقوق الجانبية الدقيقة عند الحافة مزينة أيضاً بالتقليم الذهبي، مما يبرز حرفية أتيليه بلو مارين الكويتية.</p>\n<p>خيار مثالي للمناسبات الرسمية، احتفالات العيد، أو الأمسيات الخاصة في جميع أنحاء الخليج. تتناسق هذه الدرّاعة بسهولة مع المجوهرات الذهبية، للمرأة التي تقدر التراث بلمسة عصرية.</p>\n\n<!-- gmc-enriched:start -->\n<h3>تفاصيل المنتج</h3>\n<ul>\n<li><strong>الألوان:</strong> أحمر، أبيض، أسود، عنابي</li>\n<li><strong>المقاسات:</strong> XS – 3XL</li>\n<li><strong>مادة الصنع:</strong> قطن، حرير</li>\n<li><strong>النقش:</strong> سادة</li>\n</ul>\n<!-- gmc-enriched:end -->",
    },
  },
];

async function getCurrentTags(id) {
  const d = await gql(`query($id: ID!) { product(id: $id) { tags } }`, { id });
  return d.product.tags;
}

async function updateEn(p) {
  const currentTags = await getCurrentTags(p.id);
  const newTags = currentTags.filter((t) => !p.en.tagsRemove.includes(t));

  const input = {
    id: p.id,
    title: p.en.title,
    descriptionHtml: p.en.descriptionHtml,
    seo: { title: p.en.seoTitle, description: p.en.seoDescription },
    tags: newTags,
  };

  if (DRY) {
    console.log(`[DRY] ${p.label} EN ->`, JSON.stringify({ title: input.title, seo: input.seo, removedTags: p.en.tagsRemove.filter(t => currentTags.includes(t)) }, null, 2));
    return;
  }

  const r = await gql(
    `mutation($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id title }
        userErrors { field message }
      }
    }`,
    { input }
  );
  const errs = r.productUpdate.userErrors;
  if (errs.length) throw new Error(`${p.label} EN errors: ${JSON.stringify(errs)}`);
  console.log(`✓ ${p.label} EN updated`);
}

async function updateAr(p) {
  // Re-fetch fresh digests AFTER EN update
  const d = await gql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key value digest locale }
      }
    }`,
    { id: p.id }
  );
  const byKey = {};
  for (const c of d.translatableResource.translatableContent) byKey[c.key] = c;

  const map = {
    title: p.ar.title,
    body_html: p.ar.body_html,
    meta_title: p.ar.meta_title,
    meta_description: p.ar.meta_description,
  };

  const translations = [];
  for (const [key, value] of Object.entries(map)) {
    const src = byKey[key];
    if (!src) {
      console.warn(`  ! ${p.label} AR: no source digest for key ${key}`);
      continue;
    }
    translations.push({
      key,
      value,
      locale: "ar",
      translatableContentDigest: src.digest,
    });
  }

  if (DRY) {
    console.log(`[DRY] ${p.label} AR translations:`, translations.map(t => t.key));
    return;
  }

  const r = await gql(
    `mutation($id: ID!, $translations: [TranslationInput!]!) {
      translationsRegister(resourceId: $id, translations: $translations) {
        translations { key value }
        userErrors { field message }
      }
    }`,
    { id: p.id, translations }
  );
  const errs = r.translationsRegister.userErrors;
  if (errs.length) throw new Error(`${p.label} AR errors: ${JSON.stringify(errs)}`);
  console.log(`✓ ${p.label} AR updated (${r.translationsRegister.translations.length} keys)`);
}

for (const p of PRODUCTS) {
  console.log(`\n=== ${p.label} ${DRY ? "(DRY)" : ""} ===`);
  await updateEn(p);
  await updateAr(p);
}

console.log(`\n${DRY ? "DRY RUN COMPLETE" : "DONE"}`);
