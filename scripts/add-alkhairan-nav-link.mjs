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
const COLLECTION_ID = "gid://shopify/Collection/504710431020";
const NEW_TITLE_EN = "AlKhairan";
const NEW_TITLE_AR = "الخيران";

console.log("1. Fetch current menu...");
const cur = await gql(
  `query($id: ID!) {
    menu(id: $id) {
      id handle title
      items { id title type url resourceId tags items { id title type url resourceId } }
    }
  }`,
  { id: MENU_ID },
);

const menu = cur.menu;
console.log(`   ${menu.title} (handle=${menu.handle}) — ${menu.items.length} items`);

const exists = menu.items.find((it) => it.url === `/collections/alkhairan` || it.title === NEW_TITLE_EN);
if (exists) {
  console.log(`ℹ️  Menu already has AlKhairan link (id=${exists.id}) — skipping insert.`);
  process.exit(0);
}

// Build items input — Shopify wants MenuItemUpdateInput[] for menuUpdate, not MenuItemCreateInput
const items = menu.items.map((it) => ({
  title: it.title,
  type: it.type,
  resourceId: it.resourceId || null,
  url: it.url,
  tags: it.tags || [],
  items: (it.items || []).map((c) => ({
    title: c.title, type: c.type, resourceId: c.resourceId || null, url: c.url, tags: [],
  })),
}));

items.push({
  title: NEW_TITLE_EN,
  type: "COLLECTION",
  resourceId: COLLECTION_ID,
  url: `/collections/alkhairan`,
  tags: [],
  items: [],
});

console.log(`2. menuUpdate (appending ${NEW_TITLE_EN})...`);
const upd = await gql(
  `mutation($id: ID!, $title: String!, $handle: String!, $items: [MenuItemUpdateInput!]!) {
    menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
      menu { id items { id title type url resourceId } }
      userErrors { field message }
    }
  }`,
  { id: MENU_ID, title: menu.title, handle: menu.handle, items },
);
if (upd.menuUpdate.userErrors.length) throw new Error(JSON.stringify(upd.menuUpdate.userErrors));

const updatedItems = upd.menuUpdate.menu.items;
const newLink = updatedItems.find((it) => it.url === `/collections/alkhairan`);
if (!newLink) throw new Error("New menu item not found after menuUpdate");
console.log(`   ✅ created ${newLink.id}`);

await sleep(800);

console.log("3. Register AR translation on the new Link...");
// Get translatable digests for the Link resource
const trRes = await gql(
  `query($id: ID!) {
    translatableResource(resourceId: $id) {
      resourceId
      translatableContent { key digest locale value }
    }
  }`,
  { id: newLink.id },
);
const tc = trRes.translatableResource?.translatableContent || [];
console.log(`   translatable keys: ${tc.map((c) => c.key).join(", ") || "(none)"}`);

const titleEntry = tc.find((c) => c.key === "title");
if (!titleEntry) {
  console.warn(`⚠️  No 'title' key on translatableResource for ${newLink.id} — Shopify may not have indexed it yet. Try again in a minute.`);
  process.exit(1);
}

const arRes = await gql(
  `mutation($id: ID!, $t: [TranslationInput!]!) {
    translationsRegister(resourceId: $id, translations: $t) {
      translations { key value locale }
      userErrors { field message }
    }
  }`,
  {
    id: newLink.id,
    t: [{ key: "title", value: NEW_TITLE_AR, locale: "ar", translatableContentDigest: titleEntry.digest }],
  },
);
if (arRes.translationsRegister.userErrors.length) throw new Error(JSON.stringify(arRes.translationsRegister.userErrors));
console.log(`   ✅ AR registered: ${NEW_TITLE_AR}`);

console.log(`\nDone. Menu now has ${updatedItems.length} items.`);
