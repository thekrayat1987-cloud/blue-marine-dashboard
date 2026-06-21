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

const EN_BODY = `<h2>Return &amp; Exchange Policy</h2>

<p>Every piece is custom-tailored to your measurements and carefully adjusted at our atelier so it rests elegantly on your body and you are completely satisfied with it.</p>

<p>Because each piece is made just for you, it is <strong>not eligible for return or exchange</strong>.</p>

<h3>Exception: Manufacturing defects</h3>

<p>If your item arrives with a manufacturing defect, or you receive an item different from what you ordered, please contact us within <strong>7 days of delivery</strong>. We will repair or replace it at no additional cost to you.</p>

<h3>Contact us</h3>

<ul>
  <li>WhatsApp: <a href="https://wa.me/96599592234">+965 9959 2234</a></li>
  <li>Email: <a href="mailto:info@bluemarineatelier.com">info@bluemarineatelier.com</a></li>
  <li>Hours: Sunday – Thursday, 9 AM – 9 PM Kuwait time</li>
</ul>

<h3>Conditions for the exception</h3>

<ul>
  <li>Notify us within 7 days of delivery</li>
  <li>Item unused and unwashed</li>
  <li>All tags and original packaging intact</li>
  <li>Include photos showing the defect or order error</li>
</ul>`;

const AR_BODY = `<div dir="rtl">
<h2>سياسة الاسترجاع والاستبدال</h2>

<p>كل قطعة مفصّلة خصيصاً على مقاسكِ تُعدّل في الأتيليه بعنايةٍ تامة حتى تستقر بأناقة على جسمكِ وتكونين راضيةً عنها كل الرضا.</p>

<p>ولأنها مصنوعة لكِ وحدكِ، فهي <strong>غير قابلة للاسترجاع أو الاستبدال</strong>.</p>

<h3>استثناء: العيب المصنعي</h3>

<p>في حال وصول القطعة بعيب مصنعي، أو وصول قطعة مختلفة عن طلبكِ، يُرجى التواصل معنا خلال <strong>7 أيام من تاريخ الاستلام</strong>، وسنتكفّل بإصلاحها أو استبدالها دون أي رسوم إضافية عليكِ.</p>

<h3>للتواصل</h3>

<ul>
  <li>واتساب: <a href="https://wa.me/96599592234">+965 9959 2234</a></li>
  <li>البريد الإلكتروني: <a href="mailto:info@bluemarineatelier.com">info@bluemarineatelier.com</a></li>
  <li>أوقات الرد: الأحد – الخميس، 9 صباحاً – 9 مساءً بتوقيت الكويت</li>
</ul>

<h3>شروط قبول الاستثناء</h3>

<ul>
  <li>إبلاغنا خلال 7 أيام من تاريخ الاستلام</li>
  <li>القطعة غير مستعملة وغير مغسولة</li>
  <li>محتفظة بجميع البطاقات والتغليف الأصلي</li>
  <li>إرفاق صور توضح العيب أو الخطأ في الطلب</li>
</ul>
</div>`;

console.log("1. Querying current refund policy...");
const cur = await gql(`
  query {
    shop {
      shopPolicies { id type title body url }
    }
  }
`);

const policy = cur.shop.shopPolicies.find((p) => p.type === "REFUND_POLICY");
if (!policy) throw new Error("Refund policy not found on shop");
console.log(`   id=${policy.id}`);
console.log(`   url=${policy.url}`);
console.log(`   current body length=${policy.body.length} chars`);

console.log("\n2. Updating refund policy body (EN)...");
const upd = await gql(
  `mutation($input: ShopPolicyInput!) {
    shopPolicyUpdate(shopPolicy: $input) {
      shopPolicy { id body }
      userErrors { field message }
    }
  }`,
  { input: { type: "REFUND_POLICY", body: EN_BODY } },
);

if (upd.shopPolicyUpdate.userErrors.length) {
  throw new Error("EN update failed: " + JSON.stringify(upd.shopPolicyUpdate.userErrors));
}
console.log(`   ✅ EN updated (new body length=${upd.shopPolicyUpdate.shopPolicy.body.length} chars)`);

console.log("\n3. Waiting 3s for Shopify to index new content...");
await sleep(3000);

console.log("\n4. Fetching translatable content digest for AR registration...");
let bodyEntry = null;
for (let i = 0; i < 5; i++) {
  const tr = await gql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        resourceId
        translatableContent { key value digest locale }
      }
    }`,
    { id: policy.id },
  );
  if (tr?.translatableResource?.translatableContent?.length) {
    bodyEntry = tr.translatableResource.translatableContent.find((c) => c.key === "body");
    if (bodyEntry) break;
  }
  await sleep(2000);
}
if (!bodyEntry) throw new Error("No 'body' key in translatableContent for refund policy");
console.log(`   digest=${bodyEntry.digest.slice(0, 16)}...`);

console.log("\n5. Registering AR translation...");
const arRes = await gql(
  `mutation($id: ID!, $t: [TranslationInput!]!) {
    translationsRegister(resourceId: $id, translations: $t) {
      translations { key value locale }
      userErrors { field message }
    }
  }`,
  {
    id: policy.id,
    t: [{ key: "body", value: AR_BODY, locale: "ar", translatableContentDigest: bodyEntry.digest }],
  },
);

if (arRes.translationsRegister.userErrors.length) {
  throw new Error("AR translation failed: " + JSON.stringify(arRes.translationsRegister.userErrors));
}
console.log(`   ✅ AR translation registered`);

console.log("\n✅ Done. Verify at:");
console.log(`   EN: https://bluemarineatelier.com/policies/refund-policy`);
console.log(`   AR: https://bluemarineatelier.com/policies/refund-policy (switch to AR via locale)`);
