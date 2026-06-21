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

const MENU_ID = "gid://shopify/Menu/300333334828";

// Fallbacks for non-collection items (Home, Shop All) and collections that lack AR titles
const FALLBACK_AR = {
  Home: "الرئيسية",
  "Shop All": "كل المنتجات",
  Parfum: "العطر",
};

console.log("1. Fetch menu items + their resource ids...");
const m = await gql(
  `query($id: ID!) { menu(id: $id) { items { id title type url resourceId } } }`,
  { id: MENU_ID },
);

console.log(`   ${m.menu.items.length} items\n`);

console.log("2. Resolve AR title for each item...");
const plan = [];
for (const it of m.menu.items) {
  let arTitle = null;

  if (it.type === "COLLECTION" && it.resourceId) {
    // Use the collection's own AR title (translation on Collection resource)
    const tr = await gql(
      `query($id: ID!) { translatableResource(resourceId: $id) { translations(locale: "ar") { key value } } }`,
      { id: it.resourceId },
    );
    const t = tr.translatableResource?.translations?.find((x) => x.key === "title");
    arTitle = t?.value || null;
  }

  if (!arTitle) arTitle = FALLBACK_AR[it.title] || null;

  console.log(`   ${arTitle ? "→" : "⚠️ "} ${it.title.padEnd(32)} = ${arTitle || "(NO SOURCE)"}`);
  if (arTitle) plan.push({ menuItemId: it.id, enTitle: it.title, arTitle });
}

console.log(`\n3. Register AR translation on each Link...`);
for (const p of plan) {
  const linkId = p.menuItemId.replace("MenuItem", "Link");
  // Get the digest
  const tr = await gql(
    `query($id: ID!) { translatableResource(resourceId: $id) { translatableContent { key digest locale value } translations(locale: "ar") { key value } } }`,
    { id: linkId },
  );
  const existing = tr.translatableResource?.translations?.find((t) => t.key === "title");
  if (existing?.value === p.arTitle) {
    console.log(`   ✓ ${p.enTitle.padEnd(32)} already AR=${p.arTitle}`);
    continue;
  }
  const titleEntry = tr.translatableResource?.translatableContent?.find((c) => c.key === "title");
  if (!titleEntry) {
    console.log(`   ⚠️  ${p.enTitle.padEnd(32)} — no title key on Link ${linkId}`);
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
      t: [{ key: "title", value: p.arTitle, locale: "ar", translatableContentDigest: titleEntry.digest }],
    },
  );
  if (res.translationsRegister.userErrors.length) {
    console.log(`   ❌ ${p.enTitle.padEnd(32)} — ${JSON.stringify(res.translationsRegister.userErrors)}`);
    continue;
  }
  console.log(`   ✅ ${p.enTitle.padEnd(32)} → ${p.arTitle}`);
  await sleep(150);
}

console.log("\nDone. Hard-refresh the AR storefront (Cmd+Shift+R) to see the change.");
