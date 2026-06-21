// Blue Marine — bulk-fill Google Shopping metafields + customs fields on all products.
//
// Sets per product:
//   metafields (mm-google-shopping namespace):
//     - age_group = "adult"
//     - condition = "new"
//     - gender = "female"
//     - mpn = SKU (e.g. A122)
//   inventoryItem (per variant):
//     - countryCodeOfOrigin = KW
//     - harmonizedSystemCode = 6204.49 (women's clothing)
//
// Usage:
//   Preview a single product:
//     node --env-file=.env.local scripts/fill-metafields.mjs --product=<numericId>
//   Apply on a single product:
//     node --env-file=.env.local scripts/fill-metafields.mjs --apply --product=<numericId>
//   Apply on all:
//     node --env-file=.env.local scripts/fill-metafields.mjs --apply --all

const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";

if (!STORE || !TOKEN) {
  console.error("Missing SHOPIFY_STORE_URL or SHOPIFY_ACCESS_TOKEN.");
  process.exit(1);
}

const ENDPOINT = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const all = args.has("--all");
const productArg = [...args].find((a) => a.startsWith("--product="));
const productNumericId = productArg ? productArg.split("=")[1] : null;

const GOOGLE_NS = "mm-google-shopping";
const HS_CODE = "6204.49"; // women's other-material clothing
const COUNTRY = "KW"; // Kuwait
const SLEEVE_LENGTH_LONG_GID = "gid://shopify/Metaobject/185829523756"; // shopify--sleeve-length-type/long

async function shopify(query, variables) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`);
  return json.data;
}

async function fetchProducts() {
  const out = [];
  let cursor = null;
  while (true) {
    const data = await shopify(
      `query AllProducts($cursor: String) {
        products(first: 100, after: $cursor, sortKey: UPDATED_AT, reverse: true) {
          pageInfo { hasNextPage endCursor }
          edges { node {
            id
            title
            variants(first: 100) {
              edges { node {
                id
                sku
                inventoryItem { id countryCodeOfOrigin harmonizedSystemCode }
              }}
            }
          }}
        }
      }`,
      { cursor },
    );
    for (const e of data.products.edges) out.push(e.node);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
  return out;
}

function extractSku(title, variantSku) {
  const m = title.match(/^([A-Z]\d{1,4})\b/);
  if (m) return m[1];
  if (variantSku) {
    const fm = variantSku.match(/^([A-Z]\d{1,4})/);
    if (fm) return fm[1];
  }
  return null;
}

async function setMetafields(productId, sku) {
  const metafields = [
    { ownerId: productId, namespace: GOOGLE_NS, key: "age_group", value: "adult", type: "single_line_text_field" },
    { ownerId: productId, namespace: GOOGLE_NS, key: "condition", value: "new", type: "single_line_text_field" },
    { ownerId: productId, namespace: GOOGLE_NS, key: "gender", value: "female", type: "single_line_text_field" },
    { ownerId: productId, namespace: GOOGLE_NS, key: "mpn", value: sku, type: "single_line_text_field" },
    {
      ownerId: productId,
      namespace: "shopify",
      key: "sleeve-length-type",
      value: JSON.stringify([SLEEVE_LENGTH_LONG_GID]),
      type: "list.metaobject_reference",
    },
  ];
  const data = await shopify(
    `mutation Set($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message code }
      }
    }`,
    { metafields },
  );
  return data.metafieldsSet.userErrors;
}

async function setInventoryFields(inventoryItemId) {
  const data = await shopify(
    `mutation Update($id: ID!, $input: InventoryItemInput!) {
      inventoryItemUpdate(id: $id, input: $input) {
        userErrors { field message }
      }
    }`,
    {
      id: inventoryItemId,
      input: { countryCodeOfOrigin: COUNTRY, harmonizedSystemCode: HS_CODE },
    },
  );
  return data.inventoryItemUpdate.userErrors;
}

async function processProduct(p) {
  const firstVariantSku = p.variants?.edges?.[0]?.node?.sku;
  const sku = extractSku(p.title, firstVariantSku);
  if (!sku) {
    console.log(`  ⚠ ${p.title} — no SKU detected, skipping`);
    return { skipped: true };
  }

  console.log(`  • ${p.title} (SKU: ${sku})`);
  console.log(`      Will set: age_group=adult, condition=new, gender=female, mpn=${sku}`);
  console.log(`      Will set on ${p.variants.edges.length} variant(s): countryCodeOfOrigin=${COUNTRY}, harmonizedSystemCode=${HS_CODE}`);

  if (!apply) return { previewed: true };

  const errs = await setMetafields(p.id, sku);
  if (errs.length) {
    console.log(`      ✗ Metafields: ${errs.map((e) => `${e.field}: ${e.message}`).join(", ")}`);
    return { failed: true };
  }

  let invOk = 0;
  let invFail = 0;
  for (const v of p.variants.edges) {
    const itemId = v.node.inventoryItem?.id;
    if (!itemId) continue;
    try {
      const errs = await setInventoryFields(itemId);
      if (errs.length) {
        invFail++;
      } else {
        invOk++;
      }
    } catch (err) {
      invFail++;
    }
  }
  console.log(`      ✓ Metafields set | Inventory items: ${invOk} ok, ${invFail} failed`);
  return { ok: true };
}

(async () => {
  const products = await fetchProducts();
  console.log(`Total products: ${products.length}`);

  let scope = products;
  if (productNumericId) {
    const wanted = `gid://shopify/Product/${productNumericId}`;
    scope = products.filter((p) => p.id === wanted);
    if (!scope.length) {
      console.error(`Product ${productNumericId} not found.`);
      process.exit(1);
    }
  } else if (apply && !all) {
    console.error("Refusing to mass-apply without --all or --product=<id>.");
    process.exit(1);
  }

  console.log(`Processing ${scope.length} product(s)…\n`);
  let ok = 0;
  let failed = 0;
  let skipped = 0;
  for (const p of scope) {
    try {
      const r = await processProduct(p);
      if (r.ok) ok++;
      else if (r.skipped) skipped++;
      else if (r.failed) failed++;
    } catch (err) {
      failed++;
      console.log(`  ✗ ${p.title}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log(`\nDone. OK: ${ok}, failed: ${failed}, skipped: ${skipped}.`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
