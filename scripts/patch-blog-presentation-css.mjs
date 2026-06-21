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

const t = await gql(`{ themes(first: 5, roles: [MAIN]) { edges { node { id name role } } } }`);
const themeId = t.themes.edges[0].node.id;
console.log("Theme:", themeId);

const f = await gql(
  `query($id: ID!, $f: [String!]) {
    theme(id: $id) {
      files(filenames: $f, first: 1) {
        nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  { id: themeId, f: ["layout/theme.liquid"] },
);
let content = f.theme.files.nodes[0].body.content;

const NAVY = "#1a2c4a"; // brand navy (matches logo + Darra Journal h1)
const BLOCK = `<style>/* BM_BLOG_PRESENTATION */
/* Theme renders blog post card title as a .text-block inside .blog-post-card__content
   wrapped in an <a>. Override colour + typography on those. */
.blog-post-card__content,
.blog-post-card__content a,
.blog-post-card__content .text-block,
.blog-post-card__content .text-block.h2,
.blog-post-card__content .text-block.h3,
.blog-post-card__content .text-block.h4,
.blog-post-card__content .text-block.h5 {
  color: ${NAVY} !important;
}
/* Title font: Cormorant Garamond serif */
.blog-post-card__content .text-block.h2,
.blog-post-card__content .text-block.h3,
.blog-post-card__content .text-block.h4,
.blog-post-card__content .text-block.h5 {
  font-family: 'Cormorant Garamond', 'Cairo', Georgia, sans-serif !important;
  font-weight: 500 !important;
  letter-spacing: -0.01em !important;
}
/* Article DETAIL page — title (h1) and section headings */
.template-article h1,
.template-article .article__title,
.template-article .article-template__title,
.template-article .text-block.h1,
.template-article .text-block.h2 {
  color: ${NAVY} !important;
  font-family: 'Cormorant Garamond', 'Cairo', Georgia, sans-serif !important;
  font-weight: 500 !important;
  letter-spacing: -0.01em !important;
}
/* Article body content typography (Latin → Inter, Arabic → Cairo via fallback) */
.template-article rte-formatter p,
.template-article rte-formatter li,
.template-article article p,
.template-article article li {
  font-family: 'Inter', 'Cairo', system-ui, sans-serif;
  line-height: 1.75;
  color: #2a2a2a;
}
.template-article rte-formatter h2,
.template-article article h2 {
  color: ${NAVY} !important;
  font-family: 'Cormorant Garamond', 'Cairo', Georgia, sans-serif !important;
  font-weight: 500 !important;
  margin-top: 2.5rem;
  margin-bottom: 0.75rem;
  letter-spacing: -0.01em;
}
.template-article rte-formatter h3,
.template-article article h3 {
  color: ${NAVY} !important;
  font-family: 'Cormorant Garamond', 'Cairo', Georgia, sans-serif !important;
  font-weight: 500 !important;
  margin-top: 1.75rem;
}
.template-article rte-formatter a,
.template-article article a {
  color: ${NAVY};
  text-decoration: underline;
  text-underline-offset: 3px;
}
/* Tighten card spacing on image cards */
.blog-post-item:has(.blog-post-card__image-container) .blog-post-card__content {
  padding-top: 1.25rem;
}
/* END_BM_BLOG_PRESENTATION */</style>`;

// Idempotent: replace existing block or insert before </head>
const blockRegex = /<style>\/\* BM_BLOG_PRESENTATION \*\/[\s\S]*?\/\* END_BM_BLOG_PRESENTATION \*\/<\/style>/;
if (blockRegex.test(content)) {
  console.log("Replacing existing BM_BLOG_PRESENTATION block...");
  content = content.replace(blockRegex, BLOCK);
} else {
  console.log("Inserting BM_BLOG_PRESENTATION block before </head>...");
  content = content.replace("</head>", `  ${BLOCK}\n</head>`);
}

// Bump cache-bust
const ts = new Date().toISOString().replace(/[:.]/g, "-");
content = content.replace(/<!-- bm-cache-bust:[^>]+-->/g, `<!-- bm-cache-bust:${ts} -->`);
content = content.replace(/<!-- cache-bust:[^>]+-->/g, `<!-- cache-bust: ${new Date().toISOString()} -->`);

const upd = await gql(
  `mutation($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message code }
    }
  }`,
  {
    themeId,
    files: [{ filename: "layout/theme.liquid", body: { type: "TEXT", value: content } }],
  },
);
if (upd.themeFilesUpsert.userErrors.length) throw new Error(JSON.stringify(upd.themeFilesUpsert.userErrors));
console.log("✅ theme.liquid updated.");
console.log("\nDone. Hard-refresh (Cmd+Shift+R) the blog page to see brand navy titles.");
