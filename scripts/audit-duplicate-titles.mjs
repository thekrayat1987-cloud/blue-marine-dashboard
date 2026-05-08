// List all products and flag duplicate EN / AR titles (ignoring SKU prefix).
// Usage: node --env-file=.env.local scripts/audit-duplicate-titles.mjs
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

const all = [];
let cursor = null;
while (true) {
  const d = await gql(
    `query($c: String) {
      products(first: 100, after: $c, sortKey: TITLE) {
        pageInfo { hasNextPage endCursor }
        edges { node { id title handle } }
      }
    }`,
    { c: cursor },
  );
  for (const e of d.products.edges) all.push(e.node);
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}

console.log(`Total products: ${all.length}`);

// Strip SKU prefix "A123 – " then dedupe
function stripSku(t) {
  return t.replace(/^[A-Z]\d+\s*[–-]\s*/, "").trim();
}

const enGroups = new Map();
const arGroups = new Map();

// Fetch AR translations in batches
async function fetchAr(id) {
  const t = await gql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translations(locale: "ar") { key value }
      }
    }`,
    { id },
  );
  const m = Object.fromEntries(
    (t.translatableResource?.translations || []).map((x) => [x.key, x.value]),
  );
  return m.title || "";
}

for (const p of all) {
  const enKey = stripSku(p.title).toLowerCase();
  if (!enGroups.has(enKey)) enGroups.set(enKey, []);
  enGroups.get(enKey).push(p);
}

console.log("\n=== EN title duplicates (ignoring SKU prefix) ===");
let enDupCount = 0;
for (const [key, items] of enGroups) {
  if (items.length > 1) {
    enDupCount++;
    console.log(`\n"${key}" → ${items.length} products:`);
    for (const it of items) console.log(`  - ${it.title}  (${it.handle})`);
  }
}
if (enDupCount === 0) console.log("(none)");

console.log("\n=== AR title duplicates ===");
const withAr = [];
for (const p of all) {
  const ar = await fetchAr(p.id);
  withAr.push({ ...p, ar });
}
for (const p of withAr) {
  const arKey = stripSku(p.ar).trim();
  if (!arKey) continue;
  if (!arGroups.has(arKey)) arGroups.set(arKey, []);
  arGroups.get(arKey).push(p);
}
let arDupCount = 0;
for (const [key, items] of arGroups) {
  if (items.length > 1) {
    arDupCount++;
    console.log(`\n"${key}" → ${items.length} products:`);
    for (const it of items) console.log(`  - EN: ${it.title}  /  AR: ${it.ar}  (${it.handle})`);
  }
}
if (arDupCount === 0) console.log("(none)");

console.log(`\nSummary: ${enDupCount} EN groups + ${arDupCount} AR groups have duplicates`);
