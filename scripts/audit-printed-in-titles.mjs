// Audit all products whose EN title or AR title contains "printed" / "مطبوع".
// Also reports SEO title + description for context. Read-only.
//
// Usage:
//   node --env-file=.env.local scripts/audit-printed-in-titles.mjs
const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
if (!STORE || !TOKEN) { console.error("Missing env"); process.exit(1); }
const ENDPOINT = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

async function gql(query, variables) {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const EN_RE = /\bprinted\b/i;
const AR_RE = /مطبوع/;

const matches = [];
let cursor = null;
while (true) {
  const d = await gql(
    `query($c: String) {
      products(first: 100, after: $c) {
        edges {
          cursor
          node { id title handle productType seo { title description } }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    { c: cursor },
  );
  for (const e of d.products.edges) {
    const t = await gql(
      `query($id: ID!) { translatableResource(resourceId: $id) {
        translations(locale: "ar") { key value }
      } }`,
      { id: e.node.id },
    );
    const arByKey = Object.fromEntries(t.translatableResource.translations.map((x) => [x.key, x.value]));
    const enTitleHit = EN_RE.test(e.node.title);
    const arTitleHit = arByKey.title ? AR_RE.test(arByKey.title) : false;
    const enSeoTitleHit = e.node.seo?.title ? EN_RE.test(e.node.seo.title) : false;
    const enSeoDescHit = e.node.seo?.description ? EN_RE.test(e.node.seo.description) : false;
    const arSeoTitleHit = arByKey.meta_title ? AR_RE.test(arByKey.meta_title) : false;
    const arSeoDescHit = arByKey.meta_description ? AR_RE.test(arByKey.meta_description) : false;
    if (enTitleHit || arTitleHit || enSeoTitleHit || enSeoDescHit || arSeoTitleHit || arSeoDescHit) {
      matches.push({
        id: e.node.id,
        handle: e.node.handle,
        productType: e.node.productType,
        enTitle: e.node.title,
        arTitle: arByKey.title || null,
        enSeoTitle: e.node.seo?.title || null,
        arSeoTitle: arByKey.meta_title || null,
        enSeoDesc: e.node.seo?.description || null,
        arSeoDesc: arByKey.meta_description || null,
        hits: { enTitleHit, arTitleHit, enSeoTitleHit, enSeoDescHit, arSeoTitleHit, arSeoDescHit },
      });
    }
  }
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}

console.log(JSON.stringify({ count: matches.length, matches }, null, 2));
