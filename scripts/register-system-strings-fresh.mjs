#!/usr/bin/env node
/**
 * Re-register Arabic translations using fresh digests fetched from
 * translatableContent. Bypasses stale ar-todo.json.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;
const RID = "gid://shopify/OnlineStoreThemeLocaleContent/182480240940";

const AR = {
  "shopify.collections.sorting.manual": "المميزة",
  "shopify.collections.sorting.best_selling": "الأكثر مبيعاً",
  "shopify.collections.sorting.az": "أبجدياً، أ-ي",
  "shopify.collections.sorting.za": "أبجدياً، ي-أ",
  "shopify.collections.sorting.price_ascending": "السعر، من الأقل إلى الأعلى",
  "shopify.collections.sorting.price_descending": "السعر، من الأعلى إلى الأقل",
  "shopify.collections.sorting.date_ascending": "التاريخ، من الأقدم إلى الأحدث",
  "shopify.collections.sorting.date_descending": "التاريخ، من الأحدث إلى الأقدم",
  "shopify.collections.sorting.most_relevant": "الأكثر صلة",
  "shopify.sentence.two_words_connector": "و",
  "shopify.sentence.last_word_connector": "، و",
  "shopify.pagination.previous": "السابق",
  "shopify.pagination.next": "التالي",
  "shopify.links.powered_by_shopify": "مدعوم من Shopify",
  "shopify.links.learn_more": "اعرف المزيد",
  "shopify.feed.more": "المزيد",
  "shopify.attributes.email": "البريد الإلكتروني",
  "shopify.attributes.password": "كلمة المرور",
  "shopify.attributes.first_name": "الاسم الأول",
  "shopify.attributes.last_name": "اسم العائلة",
  "shopify.email_marketing.subscribed.confirmation": "شكراً لاشتراكك في قائمتنا البريدية.",
  "shopify.email_marketing.unsubscribe": "إلغاء الاشتراك",
};

async function gql(query, variables = {}) {
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  return r.json();
}

const q = `query { translatableResourcesByIds(resourceIds:[$RID], first:1) {
  edges { node { translatableContent { key value digest type locale } } }
} }`.replace("$RID", `"${RID}"`);

const j = await gql(q);
const tc = j.data?.translatableResourcesByIds?.edges?.[0]?.node?.translatableContent || [];
console.log(`📊 Fetched ${tc.length} translatable content entries`);

const byKey = new Map(tc.map((c) => [c.key, c]));

const inputs = [];
for (const [key, value] of Object.entries(AR)) {
  const c = byKey.get(key);
  if (!c) {
    console.log(`⚠️  Missing translatable key: ${key}`);
    continue;
  }
  inputs.push({ key, value, locale: "ar", translatableContentDigest: c.digest });
}
console.log(`📝 Building ${inputs.length} translation inputs with fresh digests`);

const M = `mutation($r: ID!, $t: [TranslationInput!]!) {
  translationsRegister(resourceId: $r, translations: $t) {
    userErrors { field message code }
    translations { key value locale }
  }
}`;

let ok = 0;
const CHUNK = 50;
for (let i = 0; i < inputs.length; i += CHUNK) {
  const batch = inputs.slice(i, i + CHUNK);
  const r = await gql(M, { r: RID, t: batch });
  const errs = r.data?.translationsRegister?.userErrors || [];
  if (r.errors) {
    console.log(`❌ chunk ${i}: ${JSON.stringify(r.errors)}`);
    continue;
  }
  if (errs.length) {
    console.log(`⚠️  chunk ${i}: ${errs.length} userErrors`);
    for (const e of errs.slice(0, 5)) console.log(`     ${JSON.stringify(e)}`);
  }
  ok += batch.length - errs.length;
  console.log(`✅ chunk ${i}: ${batch.length - errs.length}/${batch.length}`);
}
console.log(`\nTotal registered: ${ok}/${inputs.length}`);

// verify
const j2 = await gql(`query { translatableResourcesByIds(resourceIds:["${RID}"], first:1) {
  edges { node { translations(locale:"ar") { key value } } }
} }`);
const tr = j2.data.translatableResourcesByIds.edges[0].node.translations;
console.log(`\n🔎 Verification (sorting keys now in registered translations):`);
for (const x of tr.filter((t) => /sorting/i.test(t.key))) console.log(`  ${x.key} = ${JSON.stringify(x.value)}`);
