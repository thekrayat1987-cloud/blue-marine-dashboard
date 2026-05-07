// Dump full EN+AR content for A125/A126/A127 so we can plan find/replace.
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
const SKUS = ["A125", "A126", "A127"];
for (const sku of SKUS) {
  const d = await gql(
    `query($q: String!) { products(first: 5, query: $q) { edges { node {
      id title tags descriptionHtml
      seo { title description }
    } } } }`,
    { q: `title:${sku}*` },
  );
  const node = d.products.edges.find((e) => e.node.title.startsWith(`${sku} `))?.node;
  if (!node) continue;
  console.log("=".repeat(72));
  console.log(`[${sku}] ${node.id}`);
  console.log(`TITLE_EN: ${node.title}`);
  console.log(`SEO_TITLE_EN: ${node.seo?.title}`);
  console.log(`SEO_DESC_EN: ${node.seo?.description}`);
  console.log(`TAGS: ${JSON.stringify(node.tags)}`);
  console.log(`BODY_EN:\n${node.descriptionHtml}`);
  const t = await gql(
    `query($id: ID!) { translatableResource(resourceId: $id) {
      translatableContent { key value digest }
      translations(locale: "ar") { key value }
    } }`,
    { id: node.id },
  );
  const arByKey = Object.fromEntries(t.translatableResource.translations.map((x) => [x.key, x.value]));
  for (const k of ["title", "meta_title", "meta_description", "body_html"]) {
    console.log(`AR_${k.toUpperCase()}:\n${arByKey[k] || "(none)"}`);
  }
}
