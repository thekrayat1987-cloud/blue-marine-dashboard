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

const BLOG_ID = "gid://shopify/Blog/119876649260";
const FROM = "/collections/darra";
const TO = "/collections/one-piece-daraa";

console.log(`Fixing dead collection links in all Darra Journal articles...`);
console.log(`  ${FROM}  →  ${TO}\n`);

const blogQ = await gql(
  `query($id: ID!) {
    blog(id: $id) {
      articles(first: 50) { edges { node { id handle title body } } }
    }
  }`,
  { id: BLOG_ID },
);

const articles = blogQ.blog.articles.edges.map((e) => e.node);
console.log(`Found ${articles.length} articles in blog.\n`);

for (const a of articles) {
  const newBody = a.body.replaceAll(FROM, TO);
  if (newBody === a.body) {
    console.log(`#${a.handle.padEnd(40)}  no occurrences, skip`);
    continue;
  }
  const occ = (a.body.match(new RegExp(FROM.replace(/\//g, "\\/"), "g")) || []).length;
  console.log(`#${a.handle.padEnd(40)}  patching ${occ} occurrence(s)...`);

  const upd = await gql(
    `mutation($id: ID!, $article: ArticleUpdateInput!) {
      articleUpdate(id: $id, article: $article) {
        article { id }
        userErrors { field message code }
      }
    }`,
    { id: a.id, article: { body: newBody } },
  );
  if (upd.articleUpdate.userErrors.length) throw new Error(JSON.stringify(upd.articleUpdate.userErrors));

  // Refresh AR translation: get current AR body, replace, re-register
  const tr = await gql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key value digest locale }
        translations(locale: "ar") { key value }
      }
    }`,
    { id: a.id },
  );
  const entries = Object.fromEntries(tr.translatableResource.translatableContent.map((c) => [c.key, c]));
  const arBody = tr.translatableResource.translations.find((t) => t.key === "body_html");
  if (arBody && entries.body_html) {
    const newArBody = arBody.value.replaceAll(FROM, TO);
    if (newArBody !== arBody.value) {
      const arRes = await gql(
        `mutation($id: ID!, $t: [TranslationInput!]!) {
          translationsRegister(resourceId: $id, translations: $t) {
            translations { key locale }
            userErrors { field message }
          }
        }`,
        {
          id: a.id,
          t: [{ key: "body_html", value: newArBody, locale: "ar", translatableContentDigest: entries.body_html.digest }],
        },
      );
      if (arRes.translationsRegister.userErrors.length) throw new Error(JSON.stringify(arRes.translationsRegister.userErrors));
      console.log(`   ✅ AR body updated`);
    }
  }
  console.log(`   ✅ EN body updated`);
}

console.log("\nDone.");
