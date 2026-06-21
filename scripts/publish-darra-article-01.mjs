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
const HANDLE = "what-is-a-darra";
const AUTHOR = "Khadija";

const TITLE_EN = "What Is a Darra? The Gulf's Most Elegant One-Piece";
const TITLE_AR = "ما هي الدرّاعة؟ القطعة الخليجية الأكثر أناقة";

const SUMMARY_EN = "A short, honest guide to the darra — where it comes from, what makes it different from an abaya or kaftan, and why Khaleeji women choose it for weddings, henna nights, and formal evenings.";
const SUMMARY_AR = "دليل مختصر وصادق حول الدرّاعة — من أين أتت، ما الذي يميّزها عن العباية أو القفطان، ولماذا تختارها المرأة الخليجية للأعراس وليالي الحنّاء والمناسبات الرسمية.";

const SEO_TITLE_EN = "What Is a Darra? Gulf One-Piece Guide | Atelier Blue Marine";
const SEO_TITLE_AR = "ما هي الدرّاعة؟ دليل القطعة الخليجية | أتيليه بلو مارين";
const SEO_DESC_EN = "Discover the darra — the traditional Gulf one-piece worn for weddings, henna nights and formal evenings. Origins, fabrics, modern cuts. Atelier Blue Marine.";
const SEO_DESC_AR = "تعرّفي على الدرّاعة — القطعة الخليجية التراثية للأعراس وليالي الحنّاء والأمسيات الرسمية. الأصول، الأقمشة، القصّات العصرية. أتيليه بلو مارين.";

const TAGS = ["darra", "guide", "khaleeji", "tradition", "wedding"];

const BODY_EN = `<p>One silhouette has defined Gulf elegance for generations. Long, flowing, generous in fabric, often quietly embroidered along the chest and the cuffs. The women who wear it call it a <em>darra</em> — and if you have ever attended a wedding in Kuwait, a henna night in Riyadh, or a family gathering in Doha, you have already seen it.</p>

<p>This guide is for women who are curious about the darra: what it actually is, how it differs from the other Gulf garments you may have heard of, and why it has become — for many of us at Atelier Blue Marine — the centrepiece of a Khaleeji wardrobe.</p>

<h2>A definition rooted in the Gulf</h2>

<p>The darra (درّاعة) is a traditional women's one-piece garment from the Arabian Peninsula. It is full-length, loose-cut, and worn over light underclothes. Unlike a two-piece set, the darra is a single, continuous silhouette from shoulder to hem — that is what gives it its quiet authority on a woman.</p>

<p>The word itself comes from classical Arabic and has been used across the Gulf for centuries, with regional variations in cut, fabric and embroidery. Today, when a Khaleeji woman says she is wearing a darra, she usually means a refined, occasion-ready version of this old silhouette — not everyday loungewear.</p>

<h2>How the darra differs from the abaya, kaftan and jalabiya</h2>

<p>This is the question we get most often.</p>

<ul>
  <li><strong>Abaya</strong> — an outer garment, traditionally black, worn <em>over</em> what you have on. It is a layer, not the dress itself.</li>
  <li><strong>Kaftan</strong> — a broader Mediterranean and North African term for a loose tunic; styles vary widely from Morocco to the Levant.</li>
  <li><strong>Jalabiya</strong> — a closer cousin to the darra, but cut more simply and often associated with daytime or domestic wear.</li>
  <li><strong>Darra</strong> — refined, occasion-driven, generous in fabric, often embroidered. It is what a Khaleeji woman puts on when the evening matters.</li>
</ul>

<p>We will go deeper into this comparison in the next article in the journal.</p>

<h2>When Khaleeji women wear the darra</h2>

<p>The darra is the quiet hero of formal Gulf life. Across Kuwait, Saudi Arabia, the UAE, Qatar, Bahrain and Oman, women reach for it when an occasion deserves real presence:</p>

<ul>
  <li>Weddings — both as a guest and at family receptions</li>
  <li>Henna nights and pre-wedding gatherings</li>
  <li>Eid al-Fitr and Eid al-Adha visits</li>
  <li>Engagement ceremonies and family dinners</li>
  <li>Diwaniyas and majlis hosting</li>
  <li>Formal evenings, charity galas, embassy receptions</li>
</ul>

<p>It is not a Ramadan-only garment, and it is not a costume. It is a year-round wardrobe choice for any evening that asks for a more considered silhouette.</p>

<h2>What makes a darra a darra</h2>

<p>Three details matter most.</p>

<h3>The silhouette</h3>

<p>A real darra falls cleanly from the shoulder, skims the body without clinging, and reaches the floor or just above. The most flattering lengths sit between 50 and 60 (measured in our house sizing), depending on a woman's height and the heel she plans to wear.</p>

<h3>The fabric</h3>

<p>Velvet for winter and formal evenings. Silk crepe and matte satin for transitional weather. Lightweight crepe and flowing chiffons for Gulf summer events. The fabric is what carries the darra's authority — a thin, papery cloth will never feel like a darra, no matter how it is cut.</p>

<h3>The embroidery</h3>

<p>Gold and silver thread along the chest, the cuffs, sometimes the hem. In some pieces a single embroidered band; in others, denser scrollwork inspired by traditional Khaleeji motifs. At Atelier Blue Marine, we work the embroidery by hand on every piece that calls for it — the difference is visible from across a room.</p>

<h2>The Atelier Blue Marine darra</h2>

<p>Our house has one job: to make the darra a Khaleeji woman would actually want to wear, season after season. That means contemporary cuts that flatter real bodies, fabrics chosen for the Gulf climate, and embroidery that is restrained, not theatrical. We size from XS to 3XL, and we offer length options because a 162cm woman and a 178cm woman both deserve a darra that falls correctly.</p>

<p>Every piece is made in limited runs, photographed on our house model, and shipped across Kuwait, Saudi Arabia, the UAE, Qatar, Bahrain and Oman.</p>

<h2>Explore the collection</h2>

<p>If this is your first darra, start with one of our signature pieces and ask us anything on WhatsApp — we will help you choose the right length, fabric and embroidery weight for the occasion you have in mind.</p>

<p><a href="/collections/one-piece-daraa"><strong>Browse the darra collection →</strong></a></p>

<p><a href="https://wa.me/96599592234"><strong>Talk to us on WhatsApp →</strong></a></p>`;

const BODY_AR = `<p>صورة ظليّة واحدة عرّفت أناقة الخليج عبر الأجيال. طويلة، منسابة، سخيّة في القماش، غالبًا مطرّزة بهدوء على الصدر والأكمام. النساء اللواتي يرتدينها يُسمّينها <em>درّاعة</em> — وإن كنتِ قد حضرتِ عرسًا في الكويت، أو ليلة حنّاء في الرياض، أو لمّة عائلية في الدوحة، فقد رأيتِها بالفعل.</p>

<p>هذا الدليل مكتوب للمرأة التي تريد أن تفهم الدرّاعة: ما هي تحديدًا، كيف تختلف عن غيرها من القطع الخليجية التي ربما سمعتِ بها، ولماذا أصبحت — بالنسبة لنا في أتيليه بلو مارين — قطعة المنزل الأساسية في خزانة المرأة الخليجية.</p>

<h2>تعريف يضرب جذوره في الخليج</h2>

<p>الدرّاعة قطعة نسائية تراثية من قطعة واحدة، أصلها من الجزيرة العربية. طويلة حتى الكاحل، فضفاضة القصّة، تُلبس فوق ملابس داخلية خفيفة. على عكس الأطقم من قطعتين، الدرّاعة صورة ظليّة واحدة متّصلة من الكتف حتى الذيل — وهذا ما يمنحها هيبتها الهادئة على جسد المرأة.</p>

<p>الكلمة نفسها من العربية الفصحى، وقد استُخدمت في أنحاء الخليج لقرون، مع اختلافات إقليمية في القصّة والقماش والتطريز. اليوم، حين تقول الخليجية إنها ترتدي درّاعة، فهي تقصد عادةً نسخة راقية مهيّأة للمناسبات من هذه الصورة الظليّة القديمة — لا ملبس بيت يومي.</p>

<h2>كيف تختلف الدرّاعة عن العباية والقفطان والجلابية</h2>

<p>هذا أكثر سؤال يصلنا.</p>

<ul>
  <li><strong>العباية</strong> — قطعة خارجية، تقليديًا سوداء، تُلبس <em>فوق</em> ما ترتدينه. طبقة، وليست الثوب نفسه.</li>
  <li><strong>القفطان</strong> — مصطلح أوسع من البحر المتوسط وشمال أفريقيا لقميص فضفاض؛ القصّات تتنوّع كثيرًا من المغرب إلى بلاد الشام.</li>
  <li><strong>الجلابية</strong> — قريبة من الدرّاعة، لكن قصّتها أبسط، وغالبًا ما ترتبط بالنهار أو الاستخدام البيتي.</li>
  <li><strong>الدرّاعة</strong> — راقية، مصمَّمة للمناسبات، سخيّة في القماش، غالبًا مطرّزة. هي ما ترتديه الخليجية حين تكون الأمسية تستحق.</li>
</ul>

<p>سنتعمّق في هذه المقارنة في المقال التالي من المجلة.</p>

<h2>متى ترتدي الخليجية الدرّاعة</h2>

<p>الدرّاعة هي البطلة الهادئة في الحياة الرسمية الخليجية. في الكويت والسعودية والإمارات وقطر والبحرين وعُمان، تختارها المرأة حين تستحق المناسبة حضورًا حقيقيًا:</p>

<ul>
  <li>الأعراس — كضيفة أو في استقبالات العائلة</li>
  <li>ليالي الحنّاء واللمّات قبل الزواج</li>
  <li>زيارات عيد الفطر وعيد الأضحى</li>
  <li>حفلات الخطوبة والعشاءات العائلية</li>
  <li>الدواوين والمجالس النسائية</li>
  <li>الأمسيات الرسمية، الحفلات الخيرية، استقبالات السفارات</li>
</ul>

<p>ليست قطعة رمضانية فقط، وليست زيًّا تنكّريًا. هي خيار خزانة على مدار السنة لأي أمسية تستدعي قصّة أكثر تأنّيًا.</p>

<h2>ما الذي يجعل الدرّاعة درّاعة</h2>

<p>ثلاث تفاصيل هي الأهم.</p>

<h3>الصورة الظليّة</h3>

<p>الدرّاعة الحقيقية تنسدل بنظافة من الكتف، تلامس الجسد دون أن تلتصق به، وتصل إلى الأرض أو ما فوقها بقليل. أكثر الأطوال تكريمًا للقامة تتراوح بين 50 و60 (بمقاييس بيتنا)، بحسب طول المرأة والكعب الذي تنوي ارتداءه.</p>

<h3>القماش</h3>

<p>المخمل لفصل الشتاء والأمسيات الرسمية. الكريب الحريري والساتان غير اللامع لأجواء التحوّل. الكريب الخفيف والشيفون المنساب لمناسبات صيف الخليج. القماش هو ما يحمل هيبة الدرّاعة — قماش رقيق ورقيّ لن يبدو أبدًا كدرّاعة، مهما كانت قصّته.</p>

<h3>التطريز</h3>

<p>خيوط ذهبية وفضّية على الصدر والأكمام، وأحيانًا الذيل. في بعض القطع شريط مطرّز واحد؛ وفي أخرى، تطريزات أكثف مستوحاة من زخارف خليجية تراثية. في أتيليه بلو مارين، نشتغل التطريز يدويًا على كل قطعة تستدعي ذلك — والفرق يُرى من الجهة الأخرى من الغرفة.</p>

<h2>درّاعة أتيليه بلو مارين</h2>

<p>لبيتنا مهمّة واحدة: أن نصنع الدرّاعة التي تريد المرأة الخليجية أن ترتديها فعلًا، موسمًا بعد موسم. هذا يعني قصّات معاصرة تليق بأجساد حقيقية، وأقمشة مختارة لمناخ الخليج، وتطريزًا مدروسًا لا مسرحيًا. مقاساتنا من XS إلى 3XL، ونوفّر خيارات الطول لأن المرأة بطول 162 سم والمرأة بطول 178 سم تستحقّان درّاعة تنسدل بشكل صحيح.</p>

<p>كل قطعة تُصنع بكميات محدودة، وتُصوَّر على عارضة البيت، وتُشحن إلى الكويت والسعودية والإمارات وقطر والبحرين وعُمان.</p>

<h2>اكتشفي المجموعة</h2>

<p>إن كانت هذه أوّل درّاعة لكِ، ابدئي بإحدى قطعنا المميّزة، واسأليننا عن كل ما يخطر ببالك على واتساب — سنساعدك على اختيار الطول والقماش وكثافة التطريز المناسبة للمناسبة التي في خاطرك.</p>

<p><a href="/collections/one-piece-daraa"><strong>تصفّحي مجموعة الدرّاعة ←</strong></a></p>

<p><a href="https://wa.me/96599592234"><strong>تحدّثي إلينا على واتساب ←</strong></a></p>`;

console.log("1. Check if article exists...");
const existing = await gql(
  `query($id: ID!) {
    blog(id: $id) {
      articles(first: 50) { edges { node { id handle title } } }
    }
  }`,
  { id: BLOG_ID },
);
let article = existing.blog.articles.edges.map((e) => e.node).find((a) => a.handle === HANDLE);

if (article) {
  console.log(`   ✅ Already exists: ${article.title} (${article.id})`);
} else {
  console.log("2. Creating article...");
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
        title: TITLE_EN,
        handle: HANDLE,
        body: BODY_EN,
        summary: SUMMARY_EN,
        author: { name: AUTHOR },
        tags: TAGS,
        isPublished: true,
        metafields: [
          { namespace: "global", key: "title_tag", value: SEO_TITLE_EN, type: "single_line_text_field" },
          { namespace: "global", key: "description_tag", value: SEO_DESC_EN, type: "single_line_text_field" },
        ],
      },
    },
  );
  if (res.articleCreate.userErrors.length) throw new Error(JSON.stringify(res.articleCreate.userErrors));
  article = res.articleCreate.article;
  console.log(`   ✅ Created: ${article.title}`);
  console.log(`      ID: ${article.id}`);
  console.log(`      Published: ${article.isPublished} at ${article.publishedAt}`);
}

console.log("3. Fetch translatable content...");
const tr = await gql(
  `query($id: ID!) {
    translatableResource(resourceId: $id) {
      translatableContent { key value digest locale }
    }
  }`,
  { id: article.id },
);
const entries = Object.fromEntries(tr.translatableResource.translatableContent.map((c) => [c.key, c]));
console.log(`   keys: ${Object.keys(entries).join(", ")}`);

console.log("4. Register AR translations...");
const t = [];
const push = (key, value) => {
  if (entries[key]) {
    t.push({ key, value, locale: "ar", translatableContentDigest: entries[key].digest });
  } else {
    console.warn(`   ⚠️  No translatable key '${key}' for article`);
  }
};
push("title", TITLE_AR);
push("body_html", BODY_AR);
push("summary_html", SUMMARY_AR);
push("meta_title", SEO_TITLE_AR);
push("meta_description", SEO_DESC_AR);

if (t.length) {
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
  console.log(`   ✅ Registered ${arRes.translationsRegister.translations.length} AR translation(s)`);
  for (const x of arRes.translationsRegister.translations) console.log(`      • ${x.key}`);
}

console.log("\nDone.");
console.log(`Article ID:      ${article.id}`);
console.log(`Live EN URL:     https://bluemarineatelier.com/blogs/darra-journal/${HANDLE}`);
console.log(`Live AR URL:     https://bluemarineatelier.com/ar/blogs/darra-journal/${HANDLE}`);
console.log(`Admin:           https://${STORE}/admin/articles/${article.id.split("/").pop()}`);
