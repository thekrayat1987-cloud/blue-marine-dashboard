#!/usr/bin/env node
import { GoogleGenAI, Modality } from "@google/genai";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
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

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const IMAGE_MODEL = "gemini-2.5-flash-image";

const HANDLE = "darra-vs-bisht-vs-jalabiya";
const BLOG_ID = "gid://shopify/Blog/119876649260";

const IMAGE_PROMPT = `# TASK
Create a luxury fashion editorial hero image for a Gulf style-guide blog article on three women's garments — the darra, the bisht, and the jalabiya. This is a horizontal blog hero for a Khaleeji luxury womenswear brand.

# COMPOSITION
Wide horizontal 16:9. Editorial flat-lay on warm cream linen background. Three distinctly WOMEN'S garments displayed lying flat, fully spread out (NOT folded into shirt-like rectangles), shown from above. The full silhouette of each dress visible — long, flowing, floor-length. Dresses partially arranged side by side with soft natural overlap.

# THE THREE WOMEN'S GARMENTS (left to right)

1. WOMEN'S DARRA — a long flowing one-piece evening dress in deep navy silk crepe. Dropped from the shoulders, generous A-line silhouette, falling to the floor. Wide, flowing sleeves (NOT shirt sleeves with cuffs and buttons). Round low neckline, NO front button placket, NO collar. Delicate gold thread embroidery scattered across the chest panel and along the wide sleeve hems. Feminine, fluid, dress-like.

2. WOMEN'S BISHT — an open formal cape (not a thobe, not a shirt). Spread out flat showing the open front silhouette. Sheer cream-gold organza over a soft underlayer, with intricate gold metallic trim running along the front opening edges and the wide sleeve openings. Open and flowing, like a kimono cape, NOT a buttoned shirt.

3. WOMEN'S JALABIYA — a soft pale-pink long flowing women's dress in lightweight chiffon. A-line cut, full-length skirt visible. Round neckline, NO buttons, NO shirt collar. Delicate scattered pintucks at the chest, very feminine. Wide bell sleeves. Looks unmistakably like a women's evening dress, NOT a men's thobe.

# CRITICAL — AVOID THESE MASCULINE FEATURES
- NO men's thobes
- NO front button plackets (rows of buttons down the chest)
- NO shirt collars or stand collars
- NO tight cuffs at the wrist
- NO rectangular folded shapes — show the dresses lying flat in their full feminine flowing silhouette

# LIGHTING & MOOD
Soft warm afternoon light from one side, gentle natural shadows. Quiet luxury, editorial calm. Luxury fashion magazine quality.

# PALETTE
Warm cream linen background, deep navy, soft pale gold, dusty pink. Restrained, cinematic colour grading.

# DETAILS
A subtle styling element placed between or beside the garments: a small sprig of olive branch, a piece of cream silk ribbon. Sparse, elegant, NOT crowded.

# CRITICAL
- No people, no models, no faces, no hands.
- No text, no logos, no captions, no watermarks.
- Photorealistic, editorial, luxury fashion magazine quality.
- Horizontal 16:9 aspect ratio.
- These are clearly WOMEN'S evening garments — long, flowing, dress-like silhouettes.`;

const TITLE_AR = "الفرق بين الدرّاعة والبشت والجلابية";
const SUMMARY_AR = "دليل واضح وبلا مصطلحات للتمييز بين القطع الخليجية الثلاث الأشهر — ما هي كل واحدة، ومن يرتديها، ومتى.";
const SEO_TITLE_AR = "الدرّاعة والبشت والجلابية: دليل القطع الخليجية | بلو مارين";
const SEO_DESC_AR = "تختلط عليكِ الدرّاعة والبشت والجلابية؟ مقارنة واضحة بين القطع الخليجية الثلاث — الأصل، القصّة، المناسبات، وكيف تنسّق كل منها.";

const BODY_EN = `<p>Three garments. Three histories. One question we hear from women all the time — at fittings, on WhatsApp, in messages from across the GCC: what is the actual difference between a darra, a bisht and a jalabiya?</p>

<p>If you are buying your first formal Khaleeji piece, the names can blur together. They are all loose. They are all long. They all have a place in Gulf wardrobes. But they are not interchangeable, and getting them right is the difference between dressing for the occasion and dressing past it.</p>

<p>Here is the clear, no-jargon guide we wish more women had access to.</p>

<h2>The three Gulf silhouettes at a glance</h2>

<p>Before we go deep, the short version:</p>

<ul>
  <li><strong>Darra (درّاعة)</strong> — a women's one-piece evening garment. Refined, occasion-driven, often embroidered. Worn for weddings, henna nights, eid evenings, formal gatherings.</li>
  <li><strong>Bisht (بشت)</strong> — a formal cloak, traditionally worn by men over their thobe for major occasions. A women's bisht exists too, often as a layering piece over a base dress. Heavy, ceremonial, instantly recognisable by its gold or silver trim.</li>
  <li><strong>Jalabiya (جلابية)</strong> — a simpler, lighter loose dress. Closer in spirit to the darra but with a more relaxed cut and lighter fabrics. Day-friendly, hosting-friendly.</li>
</ul>

<p>Now the detail.</p>

<h2>Darra: the women's evening one-piece</h2>

<p>The darra is what a Khaleeji woman reaches for when the evening matters. It falls cleanly from shoulder to floor, skims the body without clinging, and carries its authority through fabric weight and embroidery — not through tightness.</p>

<p>The fabrics are formal: velvet for winter, silk crepe and matte satin for transitional weather, lightweight crepe and chiffons for Gulf summer events. The embroidery is restrained but real — usually along the chest panel, the cuffs, sometimes the hem. Gold and silver thread, hand-finished on the pieces that deserve it.</p>

<p>You wear a darra to a wedding, a henna night, an engagement dinner, an eid evening visit, a formal majlis, a charity gala. It is a year-round garment, not a seasonal one — though winter calls for velvet and summer for breezier crepes.</p>

<h2>Bisht: the formal cloak</h2>

<p>The bisht is older and grander than the darra, and it has a different role entirely. Traditionally a men's garment — worn over a white thobe by sheikhs, grooms, dignitaries — it is a cloak, not a dress. The cut is wide, the fabric heavy, and the gold or silver trim along the front opening is what your eye locks onto across a room.</p>

<p>For women, the bisht has become a layering piece. Over a simple base dress at a wedding, over a darra at a particularly grand evening, or as the centrepiece at an engagement when the silhouette needs ceremonial weight. A women's bisht is lighter than its men's counterpart, but it carries the same visual codes — the trim, the openness at the front, the fall from the shoulder.</p>

<p>Wearing a bisht is a statement. It is for the most formal moments — your wedding, a state-level event, a major family ceremony. Not everyday formal.</p>

<h2>Jalabiya: the lighter daytime cousin</h2>

<p>The jalabiya is the most relaxed of the three. The cut is similar to the darra — long, loose, one-piece — but the construction is simpler, the fabrics lighter, and the styling code is daytime rather than evening.</p>

<p>You wear a jalabiya to host a casual majlis, to a family lunch, to a daytime henna gathering, on the first day of eid. It is comfortable, generous, easy to move in. The embroidery, when present, is gentler — pintucks at the chest, a single thread band, perhaps subtle bead-work.</p>

<p>A jalabiya can absolutely be elegant. But it is not, by codes of Gulf dress, an evening piece. If the invitation says "formal," reach for a darra or a bisht-and-base, not a jalabiya.</p>

<h2>Which one is right for your occasion?</h2>

<p>The shortest decision tree we can give you:</p>

<ul>
  <li>Wedding (guest, evening) → <strong>darra</strong></li>
  <li>Wedding (you are the bride or close family) → <strong>bisht over a base dress</strong>, or a heavily embroidered darra</li>
  <li>Henna night → <strong>darra</strong> with traditional motifs</li>
  <li>Eid morning visits → <strong>jalabiya</strong> or a lighter day-darra</li>
  <li>Eid evening dinner → <strong>darra</strong></li>
  <li>Casual family gathering, daytime → <strong>jalabiya</strong></li>
  <li>Engagement ceremony or formal majlis → <strong>darra</strong>, sometimes with a bisht layered for the moment</li>
</ul>

<p>If you are still unsure, ask. We have spent years helping women across Kuwait, Saudi Arabia, the UAE, Qatar, Bahrain and Oman pick the right piece for the right evening — there is no question too small for our WhatsApp.</p>

<p><a href="/collections/one-piece-daraa"><strong>Browse the darra collection →</strong></a></p>

<p><a href="https://wa.me/96599592234"><strong>Talk to us on WhatsApp →</strong></a></p>`;

const BODY_AR = `<p>ثلاث قطع. ثلاثة تواريخ. وسؤال واحد نسمعه من النساء طوال الوقت — في القياسات، على واتساب، في رسائل من مختلف دول الخليج: ما الفرق الحقيقي بين الدرّاعة والبشت والجلابية؟</p>

<p>إن كنتِ تشترين قطعتك الخليجية الرسمية الأولى، تختلط الأسماء بسهولة. كلها فضفاضة. كلها طويلة. كلها لها مكانها في الخزانة الخليجية. لكنّها ليست بدائل عن بعضها، والتمييز بينها هو الفرق بين أن ترتدي ما يليق بالمناسبة وأن ترتدي ما يفوقها.</p>

<p>هذا هو الدليل الواضح وبلا مصطلحات الذي نتمنى لو كان متاحًا لكثير من النساء.</p>

<h2>الصور الظليّة الخليجية الثلاث في لمحة</h2>

<p>قبل أن نتعمّق، النسخة المختصرة:</p>

<ul>
  <li><strong>الدرّاعة (درّاعة)</strong> — قطعة نسائية أمسيوية من قطعة واحدة. راقية، مصمَّمة للمناسبات، غالبًا مطرّزة. تُلبس للأعراس وليالي الحنّاء وأمسيات العيد واللمّات الرسمية.</li>
  <li><strong>البشت (بشت)</strong> — عباءة رسمية، يرتديها الرجال تقليديًا فوق الثوب في كبرى المناسبات. يوجد بشت نسائي أيضًا، غالبًا كقطعة طبقة فوق ثوب أساس. ثقيل، احتفالي، يُعرف فورًا بحاشيته الذهبية أو الفضّية.</li>
  <li><strong>الجلابية (جلابية)</strong> — قطعة فضفاضة أبسط وأخفّ. أقرب روحًا إلى الدرّاعة لكن بقصّة أكثر استرخاءً وأقمشة أخفّ. مناسبة للنهار وللاستضافة.</li>
</ul>

<p>الآن إلى التفاصيل.</p>

<h2>الدرّاعة: قطعة الأمسية النسائية</h2>

<p>الدرّاعة هي ما تختاره الخليجية حين تكون الأمسية تستحق. تنسدل بنظافة من الكتف حتى الأرض، تلامس الجسد دون أن تلتصق به، وتحمل هيبتها من خلال وزن القماش والتطريز — لا من خلال الضيق.</p>

<p>الأقمشة رسمية: المخمل لفصل الشتاء، الكريب الحريري والساتان غير اللامع لأجواء التحوّل، والكريب الخفيف والشيفون لمناسبات صيف الخليج. التطريز مدروس لكنه حقيقي — عادةً على شريط الصدر والأكمام، وأحيانًا الذيل. خيوط ذهبية وفضّية، منفّذة يدويًا على القطع التي تستحقّ ذلك.</p>

<p>تُرتدى الدرّاعة في عرس، في ليلة حنّاء، في عشاء خطوبة، في زيارة عيد مسائية، في مجلس رسمي، في حفل خيري. هي قطعة على مدار السنة، لا قطعة موسمية — وإن كان الشتاء يستدعي المخمل والصيف الكريب الأخفّ.</p>

<h2>البشت: العباءة الرسمية</h2>

<p>البشت أقدم من الدرّاعة وأكثر هيبة، وله دور مختلف تمامًا. تقليديًا قطعة رجالية — يرتديها الشيوخ والعرسان والوجهاء فوق الثوب الأبيض — وهو عباءة، لا ثوب. القصّة واسعة، القماش ثقيل، والحاشية الذهبية أو الفضّية على الفتحة الأمامية هي ما تجذب العين من الجهة الأخرى من الغرفة.</p>

<p>للنساء، أصبح البشت قطعة طبقة. فوق ثوب أساس بسيط في عرس، فوق درّاعة في أمسية بالغة الفخامة، أو كقطعة محورية في حفل خطوبة حين تستدعي الصورة الظليّة وزنًا احتفاليًا. البشت النسائي أخفّ من نظيره الرجالي، لكنه يحمل الرموز البصرية ذاتها — الحاشية، الانفتاح من الأمام، الانسدال من الكتف.</p>

<p>ارتداء البشت تصريح. هو لأكثر اللحظات رسميةً — عرسك أنتِ، حدث على مستوى الدولة، احتفال عائلي كبير. ليس للرسمي اليومي.</p>

<h2>الجلابية: القريبة الأخفّ نهارًا</h2>

<p>الجلابية أكثر القطع استرخاءً بين الثلاث. القصّة شبيهة بالدرّاعة — طويلة، فضفاضة، من قطعة واحدة — لكن البناء أبسط، الأقمشة أخفّ، والكود الستايلي نهاري لا أمسيوي.</p>

<p>تُرتدى الجلابية لاستقبال مجلس عابر، لغداء العائلة، للمّة حنّاء نهارية، في أوّل أيام العيد. هي مريحة، سخيّة، يسهل الحركة فيها. التطريز، حين يوجد، أكثر هدوءًا — كسرات صغيرة عند الصدر، شريط خيط واحد، ربما خرز ناعم.</p>

<p>يمكن للجلابية أن تكون أنيقة بكل تأكيد. لكنها بحسب أعراف اللبس الخليجي ليست قطعة أمسية. إذا قالت الدعوة "رسمي"، اختاري درّاعة أو بشتًا فوق ثوب — لا جلابية.</p>

<h2>أيّها يناسب مناسبتك؟</h2>

<p>أقصر شجرة قرار يمكننا تقديمها لكِ:</p>

<ul>
  <li>عرس (ضيفة، أمسية) ← <strong>درّاعة</strong></li>
  <li>عرس (أنتِ العروس أو من العائلة المقرّبة) ← <strong>بشت فوق ثوب أساس</strong>، أو درّاعة بتطريز كثيف</li>
  <li>ليلة حنّاء ← <strong>درّاعة</strong> بزخارف تراثية</li>
  <li>زيارات صباح العيد ← <strong>جلابية</strong> أو درّاعة نهارية أخفّ</li>
  <li>عشاء العيد المسائي ← <strong>درّاعة</strong></li>
  <li>لمّة عائلية نهارية عابرة ← <strong>جلابية</strong></li>
  <li>حفل خطوبة أو مجلس رسمي ← <strong>درّاعة</strong>، أحيانًا مع بشت طبقةً للحظة</li>
</ul>

<p>إن كنتِ ما زلتِ مترددة، اسألينا. أمضينا سنوات في مساعدة نساء في الكويت والسعودية والإمارات وقطر والبحرين وعُمان على اختيار القطعة المناسبة للأمسية المناسبة — لا يوجد سؤال صغير على واتساب.</p>

<p><a href="/collections/one-piece-daraa"><strong>تصفّحي مجموعة الدرّاعة ←</strong></a></p>

<p><a href="https://wa.me/96599592234"><strong>تحدّثي إلينا على واتساب ←</strong></a></p>`;

console.log(`\n=== Article #02: ${HANDLE} ===\n`);

console.log("1. Find article...");
const blogQ = await gql(
  `query($id: ID!) {
    blog(id: $id) {
      articles(first: 50) { edges { node { id handle title } } }
    }
  }`,
  { id: BLOG_ID },
);
const article = blogQ.blog.articles.edges.map((e) => e.node).find((x) => x.handle === HANDLE);
if (!article) throw new Error(`Article ${HANDLE} not found in blog`);
console.log(`   ${article.id}`);

console.log("2. Generate hero image via Gemini...");
const outDir = path.resolve(__dirname, "darra-hero-images");
fs.mkdirSync(outDir, { recursive: true });
const rawFile = path.join(outDir, `02-${HANDLE}-raw.png`);
const finalFile = path.join(outDir, `02-${HANDLE}.jpg`);

if (fs.existsSync(finalFile)) {
  console.log(`   ↪ image already generated, reusing ${finalFile}`);
} else {
  const res = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: [{ role: "user", parts: [{ text: IMAGE_PROMPT }] }],
    config: { responseModalities: [Modality.IMAGE] },
  });
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData?.data);
  if (!img) {
    const txt = parts.find((p) => p.text)?.text ?? "no text";
    throw new Error(`No image returned: ${txt}`);
  }
  fs.writeFileSync(rawFile, Buffer.from(img.inlineData.data, "base64"));
  console.log(`   raw: ${rawFile}`);

  await sharp(rawFile)
    .resize(1536, 864, { fit: "cover", position: "centre" })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(finalFile);
  const meta = await sharp(finalFile).metadata();
  const stat = fs.statSync(finalFile);
  console.log(`   final: ${meta.width}×${meta.height}, ${(stat.size / 1024).toFixed(0)} KB`);
}

console.log("3. Upload image to Shopify Files...");
const imgBuf = fs.readFileSync(finalFile);
const filename = `darra-journal-02-${HANDLE}.jpg`;

const staged = await gql(
  `mutation($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets { url resourceUrl parameters { name value } }
      userErrors { field message }
    }
  }`,
  {
    input: [{
      resource: "FILE",
      filename,
      mimeType: "image/jpeg",
      fileSize: String(imgBuf.length),
      httpMethod: "POST",
    }],
  },
);
if (staged.stagedUploadsCreate.userErrors.length) throw new Error(JSON.stringify(staged.stagedUploadsCreate.userErrors));
const target = staged.stagedUploadsCreate.stagedTargets[0];

const form = new FormData();
for (const par of target.parameters) form.append(par.name, par.value);
form.append("file", new Blob([new Uint8Array(imgBuf)], { type: "image/jpeg" }), filename);
const upRes = await fetch(target.url, { method: "POST", body: form });
if (!upRes.ok && upRes.status !== 201 && upRes.status !== 204) {
  throw new Error(`upload status ${upRes.status}`);
}
console.log(`   uploaded to staged target`);

const fileCreate = await gql(
  `mutation($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files { id ... on MediaImage { image { url width height } } }
      userErrors { field message }
    }
  }`,
  {
    files: [{
      originalSource: target.resourceUrl,
      contentType: "IMAGE",
      alt: "Darra, bisht and jalabiya — Gulf garments comparison",
    }],
  },
);
if (fileCreate.fileCreate.userErrors.length) throw new Error(JSON.stringify(fileCreate.fileCreate.userErrors));
const fileId = fileCreate.fileCreate.files[0].id;
console.log(`   fileId: ${fileId}`);

// Wait for processing
let imageUrl = null;
for (let i = 0; i < 30; i++) {
  await sleep(1000);
  const chk = await gql(
    `query($id: ID!) { node(id: $id) { ... on MediaImage { image { url width height } } } }`,
    { id: fileId },
  );
  if (chk.node?.image?.url) {
    imageUrl = chk.node.image.url;
    break;
  }
}
if (!imageUrl) throw new Error("Image processing timeout");
console.log(`   imageUrl: ${imageUrl}`);

console.log("4. Update article body + image...");
const upd = await gql(
  `mutation($id: ID!, $article: ArticleUpdateInput!) {
    articleUpdate(id: $id, article: $article) {
      article { id handle title image { url } }
      userErrors { field message code }
    }
  }`,
  {
    id: article.id,
    article: {
      body: BODY_EN,
      image: { url: imageUrl, altText: "Darra, bisht and jalabiya — three Gulf garments side by side" },
    },
  },
);
if (upd.articleUpdate.userErrors.length) throw new Error(JSON.stringify(upd.articleUpdate.userErrors));
console.log(`   ✅ updated`);

console.log("5. Update AR translations (body, summary, meta)...");
const tr = await gql(
  `query($id: ID!) {
    translatableResource(resourceId: $id) {
      translatableContent { key value digest locale }
    }
  }`,
  { id: article.id },
);
const entries = Object.fromEntries(tr.translatableResource.translatableContent.map((c) => [c.key, c]));
const t = [];
const push = (key, value) => {
  if (entries[key]) t.push({ key, value, locale: "ar", translatableContentDigest: entries[key].digest });
};
push("title", TITLE_AR);
push("body_html", BODY_AR);
push("summary_html", SUMMARY_AR);
push("meta_title", SEO_TITLE_AR);
push("meta_description", SEO_DESC_AR);

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
console.log(`   ✅ AR re-registered (${arRes.translationsRegister.translations.length} keys)`);

console.log("\nDone.");
console.log(`Admin: https://${STORE}/admin/articles/${article.id.split("/").pop()}`);
console.log(`Will go live: 2026-05-17 09:00 UTC (12:00 KWT)`);
