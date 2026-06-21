#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envText = fs.readFileSync(path.resolve(__dirname, "..", ".env.local"), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query, variables) {
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const BLOG_ID = "gid://shopify/Blog/119876649260";
const AUTHOR = "Khadija";

// All articles publish at 09:00 UTC (midday Kuwait, 12:00 KWT)
const SCHEDULE_HOUR_UTC = 9;
function dateAtPlusDays(days) {
  const d = new Date("2026-05-09T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(SCHEDULE_HOUR_UTC, 0, 0, 0);
  return d.toISOString();
}

const ARTICLES = [
  {
    n: 2, days: 8, handle: "darra-vs-bisht-vs-jalabiya",
    title_en: "Darra vs Bisht vs Jalabiya: Know the Difference",
    title_ar: "الفرق بين الدرّاعة والبشت والجلابية",
    summary_en: "A clear, no-jargon guide to telling the three iconic Gulf garments apart — what each one is, who wears it, and when.",
    summary_ar: "دليل واضح وبلا مصطلحات للتمييز بين القطع الخليجية الثلاث الأشهر — ما هي كل واحدة، ومن يرتديها، ومتى.",
    seo_title_en: "Darra vs Bisht vs Jalabiya: Gulf Garment Guide | Blue Marine",
    seo_title_ar: "الدرّاعة والبشت والجلابية: دليل القطع الخليجية | بلو مارين",
    seo_desc_en: "Confused between darra, bisht and jalabiya? A clear comparison of the three Gulf garments — origin, cut, occasions, and how Khaleeji women style each.",
    seo_desc_ar: "تختلط عليكِ الدرّاعة والبشت والجلابية؟ مقارنة واضحة بين القطع الخليجية الثلاث — الأصل، القصّة، المناسبات، وكيف تنسّق كل منها.",
    tags: ["darra", "bisht", "jalabiya", "guide", "khaleeji"],
    headings_en: ["The three Gulf silhouettes at a glance", "Darra: the women's evening one-piece", "Bisht: the formal cloak (men's and women's)", "Jalabiya: the lighter daytime cousin", "Which one is right for your occasion?"],
    headings_ar: ["الصور الظليّة الخليجية الثلاث في لمحة", "الدرّاعة: قطعة الأمسية النسائية", "البشت: العباءة الرسمية (للرجال والنساء)", "الجلابية: القريبة الأخفّ نهارًا", "أيّها يناسب مناسبتك؟"],
  },
  {
    n: 3, days: 16, handle: "how-to-choose-your-darra-length",
    title_en: "How to Choose Your Darra Length (50, 55, 60)",
    title_ar: "كيف تختارين طول درّاعتك المثالي",
    summary_en: "A practical guide to picking 50, 55 or 60 — based on your height, the heel you plan to wear, and the formality of the occasion.",
    summary_ar: "دليل عملي لاختيار 50 أو 55 أو 60 — بحسب طولك، والكعب الذي تنوين ارتداءه، ودرجة رسمية المناسبة.",
    seo_title_en: "Darra Length Guide: 50, 55 or 60? | Atelier Blue Marine",
    seo_title_ar: "دليل طول الدرّاعة: 50 أو 55 أو 60؟ | أتيليه بلو مارين",
    seo_desc_en: "Pick the right darra length for your height and heels. Practical sizing guide for 50, 55 and 60 — formal, semi-formal and floor-grazing options.",
    seo_desc_ar: "اختاري الطول المناسب لدرّاعتك حسب طولك والكعب. دليل عملي للقياسات 50 و55 و60 — خيارات رسمية وشبه رسمية وملامسة للأرض.",
    tags: ["darra", "sizing", "guide", "length"],
    headings_en: ["What the length numbers mean", "Match length to your height", "Match length to your heels", "Match length to occasion formality", "Still unsure? Ask us on WhatsApp"],
    headings_ar: ["ماذا تعني أرقام الطول", "اختاري الطول حسب قامتك", "اختاري الطول حسب كعبك", "اختاري الطول حسب رسمية المناسبة", "ما زلتِ مترددة؟ اسأليننا على واتساب"],
  },
  {
    n: 4, days: 24, handle: "darra-for-kuwaiti-wedding",
    title_en: "The Darra for a Kuwaiti Wedding: Styling Guide",
    title_ar: "درّاعة العرس الكويتي: دليل التنسيق",
    summary_en: "How to choose, style and accessorize a darra for a Kuwaiti wedding — guest etiquette, fabric choices, embroidery weight, and what not to wear.",
    summary_ar: "كيف تختارين وتنسّقين درّاعتك لعرس كويتي — آداب الضيافة، اختيار القماش، كثافة التطريز، وما يجب تجنّبه.",
    seo_title_en: "Darra for a Kuwaiti Wedding: Styling Guide | Blue Marine",
    seo_title_ar: "درّاعة العرس الكويتي: دليل التنسيق | بلو مارين",
    seo_desc_en: "A complete styling guide for wearing a darra to a Kuwaiti wedding — fabrics, embroidery, accessories, hair, and guest etiquette.",
    seo_desc_ar: "دليل تنسيق متكامل لارتداء الدرّاعة في عرس كويتي — الأقمشة، التطريز، الإكسسوار، الشعر، وآداب الضيافة.",
    tags: ["darra", "wedding", "kuwait", "styling", "guest"],
    headings_en: ["Reading the invitation", "Day vs evening wedding", "Embroidery weight: how much is too much", "Heels, clutch, jewellery", "What guests should never wear"],
    headings_ar: ["قراءة الدعوة", "عرس النهار vs عرس الليل", "كثافة التطريز: متى تصير كثيرة", "الكعب، الكلاتش، المجوهرات", "ما الذي لا يجب أن ترتديه الضيفة أبدًا"],
  },
  {
    n: 5, days: 32, handle: "velvet-darra-care",
    title_en: "Velvet Darra Care: Wash, Store, Travel",
    title_ar: "العناية بدرّاعة المخمل: غسيل، تخزين، سفر",
    summary_en: "Velvet is the queen of winter darras — but it asks for the right care. How to clean, fold, store and travel with a velvet piece without ruining the pile.",
    summary_ar: "المخمل ملكة درّاعات الشتاء — لكنه يستحقّ العناية الصحيحة. كيف تنظّفين وتطوين وتخزّنين وتسافرين بقطعة مخمل دون إتلاف وبرها.",
    seo_title_en: "Velvet Darra Care Guide: Wash, Store, Travel | Blue Marine",
    seo_title_ar: "دليل العناية بدرّاعة المخمل: غسيل، تخزين، سفر | بلو مارين",
    seo_desc_en: "Keep your velvet darra perfect for years. Step-by-step care guide: spot cleaning, dry cleaning, hanging, folding for travel, storage between seasons.",
    seo_desc_ar: "حافظي على درّاعة المخمل سنوات. دليل عناية خطوة بخطوة: تنظيف موضعي، غسيل جاف، تعليق، طيّ للسفر، تخزين بين المواسم.",
    tags: ["darra", "velvet", "care", "travel", "storage"],
    headings_en: ["Why velvet needs different rules", "Spot cleaning vs dry cleaning", "Hanging the right way", "Folding for travel without crease", "Off-season storage"],
    headings_ar: ["لماذا للمخمل قواعد مختلفة", "التنظيف الموضعي vs الغسيل الجاف", "التعليق بالطريقة الصحيحة", "الطيّ للسفر بلا تجعّد", "تخزين خارج الموسم"],
  },
  {
    n: 6, days: 40, handle: "henna-night-darra-embroidery",
    title_en: "Henna Night Darra: Embroidery Codes",
    title_ar: "درّاعة ليلة الحنّاء: رموز التطريز",
    summary_en: "What the embroidery on your henna-night darra is actually saying — traditional motifs, modern interpretations, and how to choose pieces with meaning.",
    summary_ar: "ماذا تقوله التطريزات على درّاعة ليلة الحنّاء فعلًا — الزخارف التراثية، التفسيرات الحديثة، وكيف تختارين قطعًا تحمل معنى.",
    seo_title_en: "Henna Night Darra: Embroidery Symbols Decoded | Blue Marine",
    seo_title_ar: "درّاعة ليلة الحنّاء: رموز التطريز مفسَّرة | بلو مارين",
    seo_desc_en: "The traditional embroidery motifs on Khaleeji henna-night darras explained — palms, vines, geometric bands, and what each says about the wearer.",
    seo_desc_ar: "الزخارف التراثية على درّاعات ليلة الحنّاء الخليجية مفسَّرة — النخيل، الفروع، الأشرطة الهندسية، وماذا يقول كلٌّ منها عن مرتديته.",
    tags: ["darra", "henna", "embroidery", "tradition"],
    headings_en: ["The role of the bride's circle", "Three classical motif families", "Modern reinterpretations", "Reading colour and thread weight", "Pieces from our archive"],
    headings_ar: ["دور دائرة العروس", "ثلاث عائلات تراثية للزخارف", "تفسيرات حديثة", "قراءة اللون وكثافة الخيط", "قطع من أرشيفنا"],
  },
  {
    n: 7, days: 48, handle: "darra-sizing-gcc-women",
    title_en: "Darra Sizing for GCC Women (XS–3XL Real Bodies)",
    title_ar: "مقاسات الدرّاعة للمرأة الخليجية (XS–3XL لأجساد حقيقية)",
    summary_en: "An honest sizing guide for Khaleeji women — bust, shoulder, hip, sleeve length, and how Atelier Blue Marine measures from XS to 3XL.",
    summary_ar: "دليل مقاسات صادق للمرأة الخليجية — الصدر، الكتف، الورك، طول الكم، وكيف يقيس أتيليه بلو مارين من XS إلى 3XL.",
    seo_title_en: "Darra Size Guide for GCC Women | Atelier Blue Marine",
    seo_title_ar: "دليل مقاسات الدرّاعة للمرأة الخليجية | أتيليه بلو مارين",
    seo_desc_en: "Detailed darra size guide for Gulf women — body measurements, fabric ease, sleeve length, and how to choose between sizes when you are between two.",
    seo_desc_ar: "دليل مقاسات تفصيلي للدرّاعة للمرأة الخليجية — قياسات الجسم، فسحة القماش، طول الكم، وكيف تختارين بين مقاسين عندما تكونين بينهما.",
    tags: ["darra", "sizing", "fit", "guide"],
    headings_en: ["How to measure yourself in 5 minutes", "Reading our XS–3XL chart", "When to size up: fabric and embroidery", "Sleeve length: standard vs long arms", "What to do if you are between sizes"],
    headings_ar: ["كيف تأخذين مقاساتك في 5 دقائق", "قراءة جدولنا من XS إلى 3XL", "متى ترفعين المقاس: القماش والتطريز", "طول الكم: قياسي vs أذرع طويلة", "ماذا تفعلين إن كنتِ بين مقاسين"],
  },
  {
    n: 8, days: 56, handle: "modern-darra-traditional-roots",
    title_en: "Modern Darra: Traditional Roots, Contemporary Cut",
    title_ar: "الدرّاعة العصرية: جذور تراثية، قصّة معاصرة",
    summary_en: "Where Atelier Blue Marine sits in the long history of the darra — what we keep from tradition, what we reinterpret, and why.",
    summary_ar: "أين يقع أتيليه بلو مارين في تاريخ الدرّاعة الطويل — ما الذي نحافظ عليه من التراث، وما الذي نُعيد تفسيره، ولماذا.",
    seo_title_en: "The Modern Darra: Atelier Blue Marine Philosophy",
    seo_title_ar: "الدرّاعة العصرية: فلسفة أتيليه بلو مارين",
    seo_desc_en: "How Atelier Blue Marine reinterprets the traditional Khaleeji darra for the modern Gulf woman — silhouette, fabric, embroidery, sizing.",
    seo_desc_ar: "كيف يُعيد أتيليه بلو مارين تفسير الدرّاعة الخليجية التراثية للمرأة الخليجية الحديثة — الصورة الظليّة، القماش، التطريز، المقاسات.",
    tags: ["darra", "blue-marine", "philosophy", "modern"],
    headings_en: ["What we kept from tradition", "What we changed and why", "The case for contemporary cuts", "Why we size XS to 3XL", "Our promise to the Khaleeji woman"],
    headings_ar: ["ما الذي حافظنا عليه من التراث", "ما الذي غيّرناه ولماذا", "الحجّة للقصّات المعاصرة", "لماذا نقيس من XS إلى 3XL", "وعدنا للمرأة الخليجية"],
  },
  {
    n: 9, days: 64, handle: "eid-darra-2026-eight-looks",
    title_en: "Eid Darra 2026: 8 Looks From Atelier Blue Marine",
    title_ar: "درّاعة العيد ٢٠٢٦: ٨ تصاميم من أتيليه بلو مارين",
    summary_en: "Eight darra looks from our 2026 collection — from morning visits to the evening majlis — with full styling notes and where to buy each.",
    summary_ar: "ثمانية تصاميم درّاعة من مجموعة 2026 — من زيارات الصباح إلى مجلس الأمسية — مع ملاحظات تنسيق كاملة وأماكن الشراء.",
    seo_title_en: "Eid Darra 2026: 8 Looks | Atelier Blue Marine",
    seo_title_ar: "درّاعة العيد ٢٠٢٦: ٨ تصاميم | أتيليه بلو مارين",
    seo_desc_en: "Eight curated darra looks for Eid 2026 across the GCC — colours, fabrics, embroidery, and full styling notes for morning visits and evening majlis.",
    seo_desc_ar: "ثمانية تصاميم درّاعة منتقاة لعيد 2026 في الخليج — ألوان، أقمشة، تطريزات، وملاحظات تنسيق كاملة لزيارات الصباح ومجلس الأمسية.",
    tags: ["darra", "eid", "lookbook", "2026"],
    headings_en: ["Look 1: morning visit", "Look 2: family lunch", "Look 3-4: afternoon majlis", "Look 5-6: evening dinner", "Look 7-8: late-night gathering"],
    headings_ar: ["التصميم 1: زيارة الصباح", "التصميم 2: غداء العائلة", "التصميم 3-4: مجلس الظهيرة", "التصميم 5-6: عشاء الأمسية", "التصميم 7-8: لمّة آخر الليل"],
  },
  {
    n: 10, days: 72, handle: "darra-fabrics-decoded",
    title_en: "Darra Fabrics Decoded: Velvet, Silk, Crepe",
    title_ar: "أقمشة الدرّاعة: مخمل، حرير، كريب",
    summary_en: "A working knowledge of the fabrics behind a real darra — velvet, silk crepe, satin, chiffon — and which one fits which season and occasion.",
    summary_ar: "معرفة عملية بأقمشة الدرّاعة الحقيقية — مخمل، كريب حريري، ساتان، شيفون — وأيّها يناسب أيّ موسم ومناسبة.",
    seo_title_en: "Darra Fabrics Guide: Velvet, Silk, Crepe | Blue Marine",
    seo_title_ar: "دليل أقمشة الدرّاعة: مخمل، حرير، كريب | بلو مارين",
    seo_desc_en: "Understand the fabrics that make a real darra — velvet, silk crepe, satin, chiffon. Pros, cons, weight, drape, and seasonal fit for the Gulf.",
    seo_desc_ar: "افهمي الأقمشة التي تصنع درّاعة حقيقية — مخمل، كريب حريري، ساتان، شيفون. مزايا، عيوب، وزن، انسدال، وملاءمة موسمية للخليج.",
    tags: ["darra", "fabric", "velvet", "silk", "guide"],
    headings_en: ["Velvet: weight and pile direction", "Silk crepe: the all-rounder", "Matte satin: photogenic and forgiving", "Chiffon and georgette for summer", "Quick reference table"],
    headings_ar: ["المخمل: الوزن واتجاه الوبر", "الكريب الحريري: الخيار الشامل", "الساتان غير اللامع: مصوَّر ومتسامح", "الشيفون والجورجيت للصيف", "جدول مرجعي سريع"],
  },
  {
    n: 11, days: 80, handle: "khaleeji-women-buying-darra-online",
    title_en: "Why Khaleeji Women Are Buying Darras Online",
    title_ar: "لماذا تشتري الخليجيات الدرّاعة أونلاين",
    summary_en: "The shift from majlis tailors to curated online houses — what changed in the GCC market, what to ask before you buy, and how Blue Marine ships across the Gulf.",
    summary_ar: "التحوّل من خيّاطي المجالس إلى البيوت المنتقاة أونلاين — ما الذي تغيّر في سوق الخليج، ماذا تسألين قبل الشراء، وكيف يشحن بلو مارين في الخليج.",
    seo_title_en: "Buying a Darra Online: GCC Guide | Atelier Blue Marine",
    seo_title_ar: "شراء الدرّاعة أونلاين: دليل الخليج | أتيليه بلو مارين",
    seo_desc_en: "How Khaleeji women across Kuwait, KSA, UAE, Qatar, Bahrain and Oman buy darras online — what to verify, return policies, shipping windows.",
    seo_desc_ar: "كيف تشتري الخليجيات في الكويت والسعودية والإمارات وقطر والبحرين وعُمان الدرّاعة أونلاين — ما يجب التحقق منه، سياسات الإرجاع، فترات الشحن.",
    tags: ["darra", "online", "gcc", "shopping"],
    headings_en: ["The old model: majlis tailors", "What changed in the last five years", "What to verify before you buy", "Return and exchange — what is fair", "Shipping across the GCC"],
    headings_ar: ["النموذج القديم: خيّاطو المجلس", "ما الذي تغيّر في السنوات الخمس الأخيرة", "ماذا تتحقّقين منه قبل الشراء", "الإرجاع والاستبدال — ما هو عادل", "الشحن في الخليج"],
  },
  {
    n: 12, days: 88, handle: "five-piece-darra-capsule-wardrobe",
    title_en: "Build a 5-Piece Darra Capsule Wardrobe",
    title_ar: "كيف تبنين خزانة من ٥ درّاعات",
    summary_en: "Five darras that cover every occasion a Khaleeji woman faces in a year — what each piece does, in what fabric, at what price point.",
    summary_ar: "خمس درّاعات تغطّي كل مناسبة تواجهها المرأة الخليجية في السنة — ما تفعله كل قطعة، بأيّ قماش، وبأيّ سعر.",
    seo_title_en: "5-Piece Darra Capsule Wardrobe Guide | Blue Marine",
    seo_title_ar: "دليل خزانة درّاعة من 5 قطع | بلو مارين",
    seo_desc_en: "Build a complete darra wardrobe with just five pieces — wedding, henna, eid, daytime majlis, and resort. Fabrics, colours, and how to budget.",
    seo_desc_ar: "ابني خزانة درّاعات متكاملة بخمس قطع فقط — عرس، حنّاء، عيد، مجلس نهاري، ومصيف. أقمشة، ألوان، وكيف توزّعين الميزانية.",
    tags: ["darra", "capsule", "wardrobe", "guide"],
    headings_en: ["Piece 1: the formal evening darra", "Piece 2: the henna-night darra", "Piece 3: the eid daytime darra", "Piece 4: the majlis darra", "Piece 5: the resort darra"],
    headings_ar: ["القطعة 1: درّاعة الأمسية الرسمية", "القطعة 2: درّاعة ليلة الحنّاء", "القطعة 3: درّاعة العيد النهارية", "القطعة 4: درّاعة المجلس", "القطعة 5: درّاعة المصيف"],
  },
];

function buildOutlineBody(headings, isAr, summary) {
  const ctaP = isAr
    ? `<p><a href="/collections/one-piece-daraa"><strong>تصفّحي مجموعة الدرّاعة ←</strong></a></p>\n<p><a href="https://wa.me/96599592234"><strong>تحدّثي إلينا على واتساب ←</strong></a></p>`
    : `<p><a href="/collections/one-piece-daraa"><strong>Browse the darra collection →</strong></a></p>\n<p><a href="https://wa.me/96599592234"><strong>Talk to us on WhatsApp →</strong></a></p>`;
  const placeholder = isAr
    ? `<p><em>(فقرة قادمة)</em></p>`
    : `<p><em>(Section coming soon)</em></p>`;
  const sections = headings.map((h) => `<h2>${h}</h2>\n${placeholder}`).join("\n\n");
  return `<p>${summary}</p>\n\n${sections}\n\n${ctaP}`;
}

console.log(`Scheduling ${ARTICLES.length} articles for the Darra Journal...\n`);

for (const a of ARTICLES) {
  const publishDate = dateAtPlusDays(a.days);
  console.log(`#${a.n.toString().padStart(2, "0")} — ${a.handle}  →  ${publishDate}`);

  // Idempotent check
  const existing = await gql(
    `query($id: ID!) {
      blog(id: $id) {
        articles(first: 50) { edges { node { id handle title } } }
      }
    }`,
    { id: BLOG_ID },
  );
  let article = existing.blog.articles.edges.map((e) => e.node).find((x) => x.handle === a.handle);

  if (article) {
    console.log(`   ↪ already exists (${article.id}), skipping create`);
  } else {
    const bodyEn = buildOutlineBody(a.headings_en, false, a.summary_en);
    const res = await gql(
      `mutation($article: ArticleCreateInput!) {
        articleCreate(article: $article) {
          article { id handle title isPublished publishedAt }
          userErrors { field message code }
        }
      }`,
      {
        article: {
          blogId: BLOG_ID,
          title: a.title_en,
          handle: a.handle,
          body: bodyEn,
          summary: a.summary_en,
          author: { name: AUTHOR },
          tags: a.tags,
          isPublished: false,
          publishDate,
          metafields: [
            { namespace: "global", key: "title_tag", value: a.seo_title_en, type: "single_line_text_field" },
            { namespace: "global", key: "description_tag", value: a.seo_desc_en, type: "single_line_text_field" },
          ],
        },
      },
    );
    if (res.articleCreate.userErrors.length) throw new Error(JSON.stringify(res.articleCreate.userErrors));
    article = res.articleCreate.article;
    console.log(`   ✅ created (published=${article.isPublished}, scheduled=${article.publishedAt})`);
  }

  // AR translations
  const tr = await gql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key value digest locale }
      }
    }`,
    { id: article.id },
  );
  const entries = Object.fromEntries(tr.translatableResource.translatableContent.map((c) => [c.key, c]));
  const bodyAr = buildOutlineBody(a.headings_ar, true, a.summary_ar);

  const t = [];
  const push = (key, value) => {
    if (entries[key]) t.push({ key, value, locale: "ar", translatableContentDigest: entries[key].digest });
  };
  push("title", a.title_ar);
  push("body_html", bodyAr);
  push("summary_html", a.summary_ar);
  push("meta_title", a.seo_title_ar);
  push("meta_description", a.seo_desc_ar);

  const arRes = await gql(
    `mutation($id: ID!, $t: [TranslationInput!]!) {
      translationsRegister(resourceId: $id, translations: $t) {
        translations { key locale }
        userErrors { field message }
      }
    }`,
    { id: article.id, t },
  );
  if (arRes.translationsRegister.userErrors.length) throw new Error(JSON.stringify(arRes.translationsRegister.userErrors));
  console.log(`   ✅ AR registered (${arRes.translationsRegister.translations.length} keys)`);

  await sleep(400);
}

console.log("\nAll done. Calendar:");
for (const a of ARTICLES) {
  console.log(`  #${a.n.toString().padStart(2, "0")} ${dateAtPlusDays(a.days).slice(0, 10)}  ${a.handle}`);
}
