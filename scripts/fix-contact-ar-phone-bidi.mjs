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

const CONTACT_ID = "gid://shopify/Page/154742096172";
const CONTACT_TITLE_AR = "تواصلي معنا";

// Fix: wrap phone number in <bdi dir="ltr"> so the "+" stays glued to the digits
// across the RTL/LTR boundary.
const CONTACT_BODY_AR = `<p>للطلبات، التفصيل الخاص، استشارات المقاسات أو التنسيق — نردّ شخصيًا على واتساب، عادةً خلال الساعة.</p>
<ul>
  <li><strong>واتساب (الأفضل):</strong> <a href="https://wa.me/96599592234" dir="ltr"><bdi>+965 9959 2234</bdi></a></li>
  <li><strong>الشحن:</strong> إلى جميع دول الخليج — الكويت، السعودية، الإمارات، قطر، البحرين، عُمان</li>
  <li><strong>أوقات الردّ:</strong> الأحد – الخميس، <bdi dir="ltr">10:00 – 20:00</bdi> (بتوقيت الكويت)</li>
</ul>
<h3>الطلبات الخاصة</h3>
<p>إذا رغبتِ في قطعة مفصّلة على مقاسكِ، بلون معيّن، أو بتعديل في التطريز — أرسلي لنا رسالة عبر <a href="https://wa.me/96599592234">واتساب</a> مع الموديل الذي أعجبكِ، ونرشدكِ من هناك.</p>
<h3>الجملة والصحافة</h3>
<p>للتعاونات، شراكات التجزئة، أو الطلبات الصحفية، تواصلي عبر <a href="https://wa.me/96599592234">واتساب</a> مع ذكر طبيعة طلبكِ.</p>`;

const trRes = await gql(
  `query($id: ID!) {
    translatableResource(resourceId: $id) {
      translatableContent { key digest locale value }
    }
  }`,
  { id: CONTACT_ID },
);
const tc = trRes.translatableResource.translatableContent;
const titleEntry = tc.find((c) => c.key === "title");
const bodyEntry = tc.find((c) => c.key === "body_html");

const ar = await gql(
  `mutation($id: ID!, $t: [TranslationInput!]!) {
    translationsRegister(resourceId: $id, translations: $t) {
      translations { key value locale }
      userErrors { field message }
    }
  }`,
  {
    id: CONTACT_ID,
    t: [
      { key: "title", value: CONTACT_TITLE_AR, locale: "ar", translatableContentDigest: titleEntry.digest },
      { key: "body_html", value: CONTACT_BODY_AR, locale: "ar", translatableContentDigest: bodyEntry.digest },
    ],
  },
);
if (ar.translationsRegister.userErrors.length) throw new Error(JSON.stringify(ar.translationsRegister.userErrors));
console.log("✅ Contact AR re-registered with bidi-isolated phone number");
console.log("   keys:", ar.translationsRegister.translations.map((t) => `${t.key}=${t.locale}`).join(", "));
