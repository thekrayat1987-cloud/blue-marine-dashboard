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

const HANDLE = "darra-journal";
const TITLE_EN = "Darra Journal";
const TITLE_AR = "مجلة الدرّاعة";

const SEO_TITLE_EN = "Darra Journal — Atelier Blue Marine";
const SEO_TITLE_AR = "مجلة الدرّاعة — أتيليه بلو مارين";
const SEO_DESC_EN = "Stories, styling guides and craft notes about the darra — the Gulf's most elegant one-piece. From Atelier Blue Marine, Kuwait.";
const SEO_DESC_AR = "قصص، أدلّة تنسيق، ومذكّرات حِرَفية حول الدرّاعة — القطعة الخليجية الأكثر أناقة. من أتيليه بلو مارين، الكويت.";

console.log("1. Check if blog exists...");
const existing = await gql(
  `query($q: String!) { blogs(first: 5, query: $q) { edges { node { id handle title } } } }`,
  { q: `handle:${HANDLE}` },
);
let blog = existing.blogs.edges[0]?.node;

if (blog) {
  console.log(`   ✅ Blog already exists: ${blog.title} (${blog.id})`);
} else {
  console.log("2. Creating blog...");
  const res = await gql(
    `mutation($blog: BlogCreateInput!) {
      blogCreate(blog: $blog) {
        blog { id handle title }
        userErrors { field message code }
      }
    }`,
    {
      blog: {
        title: TITLE_EN,
        handle: HANDLE,
        commentPolicy: "MODERATED",
        metafields: [
          { namespace: "global", key: "title_tag", value: SEO_TITLE_EN, type: "single_line_text_field" },
          { namespace: "global", key: "description_tag", value: SEO_DESC_EN, type: "single_line_text_field" },
        ],
      },
    },
  );
  if (res.blogCreate.userErrors.length) throw new Error(JSON.stringify(res.blogCreate.userErrors));
  blog = res.blogCreate.blog;
  console.log(`   ✅ Created: ${blog.title} (${blog.id})`);
}

console.log("3. Fetch translatable content...");
const tr = await gql(
  `query($id: ID!) {
    translatableResource(resourceId: $id) {
      translatableContent { key value digest locale }
    }
  }`,
  { id: blog.id },
);
const entries = Object.fromEntries(tr.translatableResource.translatableContent.map((c) => [c.key, c]));
console.log(`   keys: ${Object.keys(entries).join(", ")}`);

console.log("4. Register AR translations...");
const translations = [];
if (entries.title) {
  translations.push({ key: "title", value: TITLE_AR, locale: "ar", translatableContentDigest: entries.title.digest });
}
const metaTitleKey = Object.keys(entries).find((k) => k === "meta_title" || k.includes("title_tag"));
const metaDescKey = Object.keys(entries).find((k) => k === "meta_description" || k.includes("description_tag"));
if (metaTitleKey) {
  translations.push({ key: metaTitleKey, value: SEO_TITLE_AR, locale: "ar", translatableContentDigest: entries[metaTitleKey].digest });
}
if (metaDescKey) {
  translations.push({ key: metaDescKey, value: SEO_DESC_AR, locale: "ar", translatableContentDigest: entries[metaDescKey].digest });
}

if (translations.length) {
  const arRes = await gql(
    `mutation($id: ID!, $t: [TranslationInput!]!) {
      translationsRegister(resourceId: $id, translations: $t) {
        translations { key value locale }
        userErrors { field message }
      }
    }`,
    { id: blog.id, t: translations },
  );
  if (arRes.translationsRegister.userErrors.length) throw new Error(JSON.stringify(arRes.translationsRegister.userErrors));
  console.log(`   ✅ Registered ${arRes.translationsRegister.translations.length} AR translation(s)`);
  for (const t of arRes.translationsRegister.translations) console.log(`      • ${t.key} → ${t.value}`);
}

console.log("\nDone.");
console.log(`Blog ID: ${blog.id}`);
console.log(`Handle:  ${blog.handle}`);
console.log(`Admin:   https://${STORE}/admin/blogs/${blog.id.split("/").pop()}`);
