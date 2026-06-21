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

const MAIN_MENU_ID = "gid://shopify/Menu/300333334828";
const FOOTER_MENU_ID = "gid://shopify/Menu/300294963500";

const AR_BY_EN = {
  // Main menu
  "Home": "الرئيسية",
  "Shop All": "كل المنتجات",
  "Latest Collection": "أحدث مجموعة",
  "AlKhairan": "الخيران",
  "Bisht Noir Trio": "ثلاثية البشت الأسود",
  "One-Piece Daraa Collection": "درّاعة قطعة واحدة",
  "2-Piece Daraa Collection": "درّاعة قطعتين",
  "3-Piece Daraa Collection": "درّاعة ثلاث قطع",
  "Parfum": "العطر",
  "Journal": "المجلة",
  // Footer
  "About Atelier Blue Marine": "عن أتيليه بلو مارين",
  "FAQ": "الأسئلة الشائعة",
  "Shipping Policy": "سياسة الشحن",
  "Refund Policy": "سياسة الإرجاع",
  "Contact Us": "تواصلي معنا",
  "Size Guide": "دليل المقاسات",
};

async function translateMenu(menuId, label) {
  console.log(`\n=== ${label} (${menuId}) ===`);
  const m = await gql(
    `query($id: ID!) { menu(id: $id) { items { id title type } } }`,
    { id: menuId },
  );
  for (const it of m.menu.items) {
    const arTitle = AR_BY_EN[it.title];
    if (!arTitle) {
      console.log(`   ⚠️  ${it.title.padEnd(38)} (no AR mapping — skipped)`);
      continue;
    }
    const linkId = it.id.replace("MenuItem", "Link");
    const tr = await gql(
      `query($id: ID!) { translatableResource(resourceId: $id) { translatableContent { key digest } translations(locale: "ar") { key value } } }`,
      { id: linkId },
    );
    const existing = tr.translatableResource?.translations?.find((t) => t.key === "title");
    if (existing?.value === arTitle) {
      console.log(`   ✓  ${it.title.padEnd(38)} already AR=${arTitle}`);
      continue;
    }
    const titleEntry = tr.translatableResource?.translatableContent?.find((c) => c.key === "title");
    if (!titleEntry) {
      console.log(`   ⚠️  ${it.title.padEnd(38)} no title key on Link`);
      continue;
    }
    const res = await gql(
      `mutation($id: ID!, $t: [TranslationInput!]!) {
        translationsRegister(resourceId: $id, translations: $t) {
          translations { key value locale }
          userErrors { field message }
        }
      }`,
      {
        id: linkId,
        t: [{ key: "title", value: arTitle, locale: "ar", translatableContentDigest: titleEntry.digest }],
      },
    );
    if (res.translationsRegister.userErrors.length) {
      console.log(`   ❌ ${it.title.padEnd(38)} ${JSON.stringify(res.translationsRegister.userErrors)}`);
      continue;
    }
    console.log(`   ✅ ${it.title.padEnd(38)} → ${arTitle}`);
    await sleep(150);
  }
}

await translateMenu(MAIN_MENU_ID, "MAIN MENU");
await translateMenu(FOOTER_MENU_ID, "FOOTER MENU");
console.log("\nDone. Hard-refresh the AR storefront (Cmd+Shift+R).");
