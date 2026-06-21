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

const ABOUT_ID = "gid://shopify/Page/152299897132";
const CONTACT_ID = "gid://shopify/Page/154742096172";

const ABOUT_TITLE_EN = "About Atelier Blue Marine";
const ABOUT_TITLE_AR = "عن أتيليه بلو مارين";
const ABOUT_BODY_EN = `<p>Atelier Blue Marine is a Gulf-born house dedicated to the modern Khaleeji woman — the one who values heritage as much as she values quiet refinement.</p>
<p>We design darra'a, bisht sets, caftans and evening pieces for the women of the Gulf: Kuwait, Saudi Arabia, the UAE, Qatar, Bahrain and Oman. Every piece is cut to honour the silhouette, embroidered with the patience our craft deserves, and finished in fabrics that hold their poise from morning gatherings to evening receptions.</p>
<h3>Our philosophy</h3>
<ul>
  <li><strong>Heritage, reinterpreted.</strong> Traditional Khaleeji codes, lifted into a contemporary wardrobe.</li>
  <li><strong>Made to be lived in.</strong> Wedding, henna, eid, formal evenings, family gatherings — one wardrobe, every occasion.</li>
  <li><strong>Quiet luxury.</strong> No loud logos. Just fabric, cut, and the confidence of a piece that fits you alone.</li>
</ul>
<p>Founded and led by Khadija, the atelier ships across the GCC and welcomes private styling requests by <a href="https://wa.me/96599592234">WhatsApp</a>.</p>`;
const ABOUT_BODY_AR = `<p>أتيليه بلو مارين دار خليجية المنشأ، مكرّسة للمرأة الخليجية العصرية — تلك التي تقدّر التراث بقدر ما تقدّر الرقيّ الهادئ.</p>
<p>نصمّم الدرّاعات، أطقم البشت، القفاطين، وقطع السهرة لنساء الخليج: الكويت، السعودية، الإمارات، قطر، البحرين، وعُمان. كل قطعة مفصّلة لتُكرّم القوام، مطرّزة بصبر تستحقّه حرفتنا، ومُنجزة بأقمشة تحفظ وقارها من جلسات الصباح إلى استقبالات المساء.</p>
<h3>فلسفتنا</h3>
<ul>
  <li><strong>تراث بصياغة عصرية.</strong> أكواد خليجية أصيلة، مُعاد تقديمها في خزانة معاصرة.</li>
  <li><strong>مصمَّمة لتُعاش.</strong> عرس، حنّة، عيد، سهرات رسمية، جمعات عائلية — خزانة واحدة، لكل المناسبات.</li>
  <li><strong>فخامة هادئة.</strong> بلا شعارات صاخبة. فقط القماش، القصّة، وثقة قطعة تناسبكِ وحدك.</li>
</ul>
<p>تأسّست الدار بقيادة خديجة، وتشحن إلى جميع دول الخليج، وترحّب بطلبات التنسيق الخاصة عبر <a href="https://wa.me/96599592234">واتساب</a>.</p>`;

const CONTACT_TITLE_EN = "Get in Touch";
const CONTACT_TITLE_AR = "تواصلي معنا";
const CONTACT_BODY_EN = `<p>For orders, custom requests, sizing advice or styling consultations — we answer personally on WhatsApp, usually within the hour.</p>
<ul>
  <li><strong>WhatsApp (preferred):</strong> <a href="https://wa.me/96599592234">+965 9959 2234</a></li>
  <li><strong>Shipping:</strong> Across the GCC — Kuwait, Saudi Arabia, UAE, Qatar, Bahrain, Oman</li>
  <li><strong>Hours:</strong> Sunday – Thursday, 10:00 – 20:00 (Kuwait time)</li>
</ul>
<h3>Custom orders</h3>
<p>If you'd like a piece tailored to your measurements, a specific colour, or an embroidery adjustment — send us a message on <a href="https://wa.me/96599592234">WhatsApp</a> with the model that caught your eye and we'll guide you from there.</p>
<h3>Wholesale &amp; press</h3>
<p>For collaborations, retail partnerships or press requests, please reach out on <a href="https://wa.me/96599592234">WhatsApp</a> and mention the nature of your enquiry.</p>`;
const CONTACT_BODY_AR = `<p>للطلبات، التفصيل الخاص، استشارات المقاسات أو التنسيق — نردّ شخصيًا على واتساب، عادةً خلال الساعة.</p>
<ul>
  <li><strong>واتساب (الأفضل):</strong> <a href="https://wa.me/96599592234">+965 9959 2234</a></li>
  <li><strong>الشحن:</strong> إلى جميع دول الخليج — الكويت، السعودية، الإمارات، قطر، البحرين، عُمان</li>
  <li><strong>أوقات الردّ:</strong> الأحد – الخميس، 10:00 – 20:00 (بتوقيت الكويت)</li>
</ul>
<h3>الطلبات الخاصة</h3>
<p>إذا رغبتِ في قطعة مفصّلة على مقاسكِ، بلون معيّن، أو بتعديل في التطريز — أرسلي لنا رسالة عبر <a href="https://wa.me/96599592234">واتساب</a> مع الموديل الذي أعجبكِ، ونرشدكِ من هناك.</p>
<h3>الجملة والصحافة</h3>
<p>للتعاونات، شراكات التجزئة، أو الطلبات الصحفية، تواصلي عبر <a href="https://wa.me/96599592234">واتساب</a> مع ذكر طبيعة طلبكِ.</p>`;

async function updatePage(id, title, body) {
  const res = await gql(
    `mutation($id: ID!, $page: PageUpdateInput!) {
      pageUpdate(id: $id, page: $page) {
        page { id handle title }
        userErrors { field message }
      }
    }`,
    { id, page: { title, body } },
  );
  if (res.pageUpdate.userErrors.length) throw new Error(JSON.stringify(res.pageUpdate.userErrors));
  return res.pageUpdate.page;
}

async function registerAR(id, titleAR, bodyAR) {
  const trRes = await gql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key digest locale value }
      }
    }`,
    { id },
  );
  const tc = trRes.translatableResource.translatableContent;
  const titleEntry = tc.find((c) => c.key === "title");
  const bodyEntry = tc.find((c) => c.key === "body_html");
  if (!titleEntry || !bodyEntry) {
    throw new Error(`Missing translatable keys on ${id}: ${tc.map((c) => c.key).join(", ")}`);
  }
  const ar = await gql(
    `mutation($id: ID!, $t: [TranslationInput!]!) {
      translationsRegister(resourceId: $id, translations: $t) {
        translations { key value locale }
        userErrors { field message }
      }
    }`,
    {
      id,
      t: [
        { key: "title", value: titleAR, locale: "ar", translatableContentDigest: titleEntry.digest },
        { key: "body_html", value: bodyAR, locale: "ar", translatableContentDigest: bodyEntry.digest },
      ],
    },
  );
  if (ar.translationsRegister.userErrors.length) throw new Error(JSON.stringify(ar.translationsRegister.userErrors));
  return ar.translationsRegister.translations;
}

console.log("1/4 Updating About (EN)...");
const aboutEN = await updatePage(ABOUT_ID, ABOUT_TITLE_EN, ABOUT_BODY_EN);
console.log(`   ✅ ${aboutEN.title} (handle=${aboutEN.handle})`);
await sleep(600);

console.log("2/4 Updating Contact (EN)...");
const contactEN = await updatePage(CONTACT_ID, CONTACT_TITLE_EN, CONTACT_BODY_EN);
console.log(`   ✅ ${contactEN.title} (handle=${contactEN.handle})`);
await sleep(600);

console.log("3/4 Registering About AR translation...");
const aboutAR = await registerAR(ABOUT_ID, ABOUT_TITLE_AR, ABOUT_BODY_AR);
console.log(`   ✅ AR keys registered: ${aboutAR.map((t) => t.key).join(", ")}`);
await sleep(600);

console.log("4/4 Registering Contact AR translation...");
const contactAR = await registerAR(CONTACT_ID, CONTACT_TITLE_AR, CONTACT_BODY_AR);
console.log(`   ✅ AR keys registered: ${contactAR.map((t) => t.key).join(", ")}`);

console.log("\n✅ Done. Footer menu already links to both pages — no menu update needed.");
console.log("   EN URLs:");
console.log(`   - https://bluemarineatelier.com/pages/${aboutEN.handle}`);
console.log(`   - https://bluemarineatelier.com/pages/${contactEN.handle}`);
console.log("   AR URLs:");
console.log(`   - https://bluemarineatelier.com/ar/pages/${aboutEN.handle}`);
console.log(`   - https://bluemarineatelier.com/ar/pages/${contactEN.handle}`);
