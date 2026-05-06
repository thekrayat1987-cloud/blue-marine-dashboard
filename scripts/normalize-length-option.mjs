// Blue Marine — normalize Shopify product length option names.
//
// Renames any option matching common misspellings (Lenght in inch, Lenght,
// Lenght in size, Lenght In inch, Lenght in incg, Length in inch with bad casing,
// Longueur, ...) to the canonical "Length in inch".
//
// Usage from the dashboard/ folder:
//   List products that would change (dry run, default):
//     node --env-file=.env.local scripts/normalize-length-option.mjs
//
//   Apply on a single product (test):
//     node --env-file=.env.local scripts/normalize-length-option.mjs --apply --product=<numericId>
//
//   Apply on every misspelled product:
//     node --env-file=.env.local scripts/normalize-length-option.mjs --apply --all
//
// Reads SHOPIFY_STORE_URL, SHOPIFY_ACCESS_TOKEN, SHOPIFY_API_VERSION from env.

const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";

if (!STORE || !TOKEN) {
  console.error("Missing SHOPIFY_STORE_URL or SHOPIFY_ACCESS_TOKEN env vars.");
  process.exit(1);
}

const ENDPOINT = `https://${STORE}/admin/api/${VERSION}/graphql.json`;
const CANONICAL_NAME = "Length in inch";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const all = args.has("--all");
const productArg = [...args].find((a) => a.startsWith("--product="));
const productNumericId = productArg ? productArg.split("=")[1] : null;

function isMisspelledLength(optionName) {
  const n = optionName.trim();
  if (n === CANONICAL_NAME) return false;
  const lower = n.toLowerCase();
  return (
    lower.includes("lenght") ||
    lower.includes("longueur") ||
    (lower.startsWith("length") && n !== CANONICAL_NAME)
  );
}

async function gql(query, variables) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

async function fetchAllProducts() {
  const out = [];
  let cursor = null;
  while (true) {
    const data = await gql(
      `query AllProducts($cursor: String) {
        products(first: 100, after: $cursor, sortKey: UPDATED_AT, reverse: true) {
          pageInfo { hasNextPage endCursor }
          edges { node {
            id
            title
            options { id name values }
          }}
        }
      }`,
      { cursor },
    );
    const edges = data.products.edges;
    for (const e of edges) out.push(e.node);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
  return out;
}

async function renameOption(productId, optionId) {
  const data = await gql(
    `mutation OptionRename($productId: ID!, $option: OptionUpdateInput!) {
      productOptionUpdate(productId: $productId, option: $option) {
        userErrors { field message code }
      }
    }`,
    {
      productId,
      option: { id: optionId, name: CANONICAL_NAME },
    },
  );
  return data.productOptionUpdate.userErrors;
}

(async () => {
  console.log("Scanning products…");
  const products = await fetchAllProducts();
  console.log(`Total products: ${products.length}`);

  const targets = products
    .map((p) => {
      const bad = p.options.find((o) => isMisspelledLength(o.name));
      if (!bad) return null;
      return { id: p.id, title: p.title, optionId: bad.id, optionName: bad.name };
    })
    .filter(Boolean);

  console.log(`Products with mis-spelled length option: ${targets.length}`);
  for (const t of targets) {
    console.log(`  · ${t.title} — "${t.optionName}"`);
  }

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply --product=<id> or --apply --all.");
    return;
  }

  let scope = targets;
  if (productNumericId) {
    const wanted = `gid://shopify/Product/${productNumericId}`;
    scope = targets.filter((t) => t.id === wanted);
    if (!scope.length) {
      console.error(`No misspelled length option on product ${productNumericId}.`);
      process.exit(1);
    }
  } else if (!all) {
    console.error("Refusing to run without --all or --product=<id>.");
    process.exit(1);
  }

  console.log(`\nApplying rename on ${scope.length} product(s)…`);
  let ok = 0;
  let failed = 0;
  for (const t of scope) {
    try {
      const errs = await renameOption(t.id, t.optionId);
      if (errs.length) {
        failed++;
        console.log(`  ✗ ${t.title}: ${errs.map((e) => e.message).join(", ")}`);
      } else {
        ok++;
        console.log(`  ✓ ${t.title}`);
      }
    } catch (err) {
      failed++;
      console.log(`  ✗ ${t.title}: ${err.message}`);
    }
  }
  console.log(`\nDone. Success: ${ok}, Failed: ${failed}.`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
