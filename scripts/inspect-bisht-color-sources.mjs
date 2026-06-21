#!/usr/bin/env node
/**
 * READ-ONLY: For every active bisht-set product, surface where the color
 * info actually lives so we can decide how to backfill the variant color
 * metafield without guessing from the title.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const URL_ = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${process.env.SHOPIFY_API_VERSION || "2024-10"}/graphql.json`;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

async function gql(q, v = {}) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query: q, variables: v }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const products = [];
let cursor = null;
while (true) {
  const d = await gql(
    `query($cursor:String){
      products(first: 25, after: $cursor, query: "status:active product_type:'Bisht Set'") {
        pageInfo { hasNextPage endCursor }
        edges { node {
          id handle title productType tags
          descriptionHtml
          featuredImage { url altText }
          colorMetaobject: metafield(namespace:"shopify", key:"color-pattern") { value type reference { ... on Metaobject { handle fields { key value } } } }
          colorMm: metafield(namespace:"mm-google-shopping", key:"color") { value }
          options { name values }
          variants(first: 5) {
            edges { node { id title selectedOptions { name value } vColor: metafield(namespace:"mm-google-shopping", key:"color") { value } } }
          }
        } }
      }
    }`,
    { cursor },
  );
  for (const e of d.products.edges) products.push(e.node);
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}

const rows = products.map((p) => {
  const desc = (p.descriptionHtml || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const descSnippet = desc.slice(0, 240);
  const colorRefHandle = p.colorMetaobject?.reference?.handle || null;
  const colorRefFields = p.colorMetaobject?.reference?.fields
    ? Object.fromEntries(p.colorMetaobject.reference.fields.map((f) => [f.key, f.value]))
    : null;
  return {
    handle: p.handle,
    title: p.title,
    tags_color_like: p.tags.filter((t) =>
      /color|couleur|noir|black|white|blanc|ivory|ivoire|red|rouge|blue|bleu|green|vert|emerald|gold|or|silver|argent|pink|rose|burgundy|bordeaux|navy|beige|brown|marron|grey|gris|purple|violet/i.test(t),
    ),
    options: p.options.map((o) => ({ name: o.name, values: o.values })),
    color_metaobject_handle: colorRefHandle,
    color_metaobject_fields: colorRefFields,
    color_mm_google_value: p.colorMm?.value || null,
    variant_count_sample: p.variants.edges.length,
    sample_variant_color_metafield: p.variants.edges[0]?.node.vColor?.value || null,
    desc_first_240_chars: descSnippet,
    featured_image_url: p.featuredImage?.url || null,
  };
});

const summary = {
  generated_at: new Date().toISOString(),
  total_bisht_set_products: products.length,
  with_color_metaobject_link: rows.filter((r) => r.color_metaobject_handle).length,
  with_product_level_mm_color: rows.filter((r) => r.color_mm_google_value).length,
  with_variant_color: rows.filter((r) => r.sample_variant_color_metafield).length,
  with_color_like_tag: rows.filter((r) => r.tags_color_like.length).length,
  rows,
};

writeFileSync(resolve(__dirname, "..", "bisht-color-sources.json"), JSON.stringify(summary, null, 2));

console.log(`Total bisht-set products: ${products.length}`);
console.log(`  with color metaobject link: ${summary.with_color_metaobject_link}`);
console.log(`  with mm-google-shopping.color (product-level): ${summary.with_product_level_mm_color}`);
console.log(`  with variant-level color metafield: ${summary.with_variant_color}`);
console.log(`  with color-like tag: ${summary.with_color_like_tag}`);
console.log(`\nFirst 3 rows:`);
console.log(JSON.stringify(rows.slice(0, 3), null, 2));
