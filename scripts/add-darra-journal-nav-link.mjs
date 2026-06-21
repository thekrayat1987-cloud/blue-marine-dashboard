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
const TITLE_EN = "Journal";
const TITLE_AR = "مجلة";
const URL_PATH = "/blogs/darra-journal";

async function ensureLink(menuId, label) {
  const cur = await gql(
    `query($id: ID!) {
      menu(id: $id) {
        id handle title
        items { id title type url resourceId tags items { id title type url resourceId } }
      }
    }`,
    { id: menuId },
  );
  const menu = cur.menu;
  console.log(`\n${label}: ${menu.title} (${menu.items.length} items)`);

  const existing = menu.items.find((it) => it.url === URL_PATH || it.title === TITLE_EN);
  if (existing) {
    console.log(`   ↪ already has Journal link (${existing.id})`);
    return existing;
  }

  const newItems = [
    ...menu.items.map((it) => ({
      title: it.title,
      type: it.type,
      url: it.url,
      resourceId: it.resourceId,
      tags: it.tags || [],
      items: (it.items || []).map((sub) => ({
        title: sub.title,
        type: sub.type,
        url: sub.url,
        resourceId: sub.resourceId,
      })),
    })),
    { title: TITLE_EN, type: "HTTP", url: URL_PATH, items: [] },
  ];

  const upd = await gql(
    `mutation($id: ID!, $title: String!, $handle: String!, $items: [MenuItemUpdateInput!]!) {
      menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
        menu { id items { id title url } }
        userErrors { field message code }
      }
    }`,
    { id: menu.id, title: menu.title, handle: menu.handle, items: newItems },
  );
  if (upd.menuUpdate.userErrors.length) throw new Error(JSON.stringify(upd.menuUpdate.userErrors));
  const added = upd.menuUpdate.menu.items.find((it) => it.url === URL_PATH);
  console.log(`   ✅ Added: ${added.title} → ${added.url} (${added.id})`);
  return added;
}

async function translateLink(linkId, label) {
  let tr = null;
  for (let i = 0; i < 12; i++) {
    try {
      tr = await gql(
        `query($id: ID!) {
          translatableResource(resourceId: $id) {
            translatableContent { key value digest locale }
          }
        }`,
        { id: linkId },
      );
      if (tr?.translatableResource?.translatableContent?.length) break;
    } catch {}
    await sleep(2500);
  }
  if (!tr?.translatableResource) {
    console.warn(`   ⚠️  ${label}: translatable resource never came up for ${linkId}; translate manually in admin`);
    return false;
  }
  const titleEntry = tr.translatableResource.translatableContent.find((c) => c.key === "title");
  if (!titleEntry) {
    console.warn(`   ⚠️  ${label}: no 'title' key in translatable content`);
    return false;
  }
  const arRes = await gql(
    `mutation($id: ID!, $t: [TranslationInput!]!) {
      translationsRegister(resourceId: $id, translations: $t) {
        translations { key value locale }
        userErrors { field message }
      }
    }`,
    { id: linkId, t: [{ key: "title", value: TITLE_AR, locale: "ar", translatableContentDigest: titleEntry.digest }] },
  );
  if (arRes.translationsRegister.userErrors.length) throw new Error(JSON.stringify(arRes.translationsRegister.userErrors));
  console.log(`   ✅ ${label} AR: ${TITLE_AR}`);
  return true;
}

// Pass 1: ensure both menus have the link
const main = await ensureLink(MAIN_MENU_ID, "Main menu");
const footer = await ensureLink(FOOTER_MENU_ID, "Footer");

// Pass 2: translate (gives Shopify time to index new menu items)
console.log("\nWaiting 5s for Shopify to index new menu items...");
await sleep(5000);

await translateLink(main.id, "Main");
await translateLink(footer.id, "Footer");

console.log("\nDone.");
