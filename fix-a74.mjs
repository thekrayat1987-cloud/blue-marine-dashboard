import fs from 'node:fs';
const env = Object.fromEntries(
  fs.readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const STORE = env.SHOPIFY_STORE_URL, TOKEN = env.SHOPIFY_ACCESS_TOKEN, VER = env.SHOPIFY_API_VERSION || '2024-10';
const base = `https://${STORE}/admin/api/${VER}`;
const headers = { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' };
const APPLY = process.env.APPLY === '1';
const gidP = 'gid://shopify/Product/10238019305772';
async function gql(q, v) { const r = await fetch(`${base}/graphql.json`, { method: 'POST', headers, body: JSON.stringify({ query: q, variables: v }) }); const j = await r.json(); if (j.errors) throw new Error(JSON.stringify(j.errors)); return j.data; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const REMOVE = ['Red', 'Green', 'Burgundy'];
const TOKEN_BY_COLOR = { Pink: 'FUCHSIA_PINK', Blue: 'BLUE' };

// fetch option + all variants
let after = null, V = [];
let colorOpt = null;
do {
  const d = await gql(`query($id:ID!,$a:String){ product(id:$id){
    options{ id name optionValues{ id name } }
    variants(first:100,after:$a){ pageInfo{hasNextPage endCursor} nodes{ id sku selectedOptions{name value} inventoryQuantity } } } }`, { id: gidP, a: after });
  colorOpt = d.product.options.find((o) => o.name === 'Color');
  V.push(...d.product.variants.nodes);
  after = d.product.variants.pageInfo.hasNextPage ? d.product.variants.pageInfo.endCursor : null;
} while (after);

const opt = (v, n) => v.selectedOptions.find((s) => s.name === n)?.value;
const valToDelete = colorOpt.optionValues.filter((ov) => REMOVE.includes(ov.name));
const cnt = (name) => V.filter((v) => opt(v, 'Color') === name).length;
const stk = (name) => V.filter((v) => opt(v, 'Color') === name).reduce((a, v) => a + (v.inventoryQuantity || 0), 0);

console.log('=== STEP 1: REMOVE COLORS ===');
for (const ov of valToDelete) console.log(`  delete "${ov.name}" → ${cnt(ov.name)} variants, ${stk(ov.name)} units in stock`);
console.log('  KEEP:', colorOpt.optionValues.filter((ov) => !REMOVE.includes(ov.name)).map((ov) => `${ov.name}(${cnt(ov.name)}v, ${stk(ov.name)} units)`).join(', '));

// Blue SKU fill (blanks only)
const existing = new Set(V.filter((v) => v.sku).map((v) => v.sku));
const skuChanges = [];
for (const v of V) {
  const color = opt(v, 'Color');
  if (REMOVE.includes(color)) continue;          // being deleted
  if (v.sku && v.sku.trim()) continue;           // already has SKU
  const tok = TOKEN_BY_COLOR[color];
  const newSku = `A74-${tok}-${opt(v, 'Size')}-${opt(v, 'Length in inch')}`;
  if (existing.has(newSku)) { console.log('⚠ collision', newSku); process.exit(1); }
  existing.add(newSku);
  skuChanges.push({ id: v.id, color, newSku });
}
console.log('\n=== STEP 2: FILL MISSING SKUs ===');
console.log(`  ${skuChanges.length} variants need SKUs:`, skuChanges.length ? `e.g. ${skuChanges[0].newSku} … ${skuChanges[skuChanges.length - 1].newSku}` : 'none');

if (!APPLY) { console.log('\n(dry run — set APPLY=1 to execute)'); process.exit(0); }

// STEP 1: delete colors (MANAGE removes orphaned variants)
console.log('\n[1] deleting colors…');
const del = await gql(`mutation($pid:ID!,$opt:OptionUpdateInput!,$del:[ID!]){ productOptionUpdate(productId:$pid, option:$opt, optionValuesToDelete:$del, variantStrategy:MANAGE){ product{ options{name optionValues{name}} } userErrors{ field message code } } }`,
  { pid: gidP, opt: { id: colorOpt.id }, del: valToDelete.map((d) => d.id) });
if (del.productOptionUpdate.userErrors.length) throw new Error(JSON.stringify(del.productOptionUpdate.userErrors));
console.log('  Colors now:', del.productOptionUpdate.product.options.find((o) => o.name === 'Color').optionValues.map((x) => x.name).join(', '));

// STEP 2: fill SKUs
console.log('[2] filling SKUs…');
let done = 0;
for (let i = 0; i < skuChanges.length; i += 25) {
  const chunk = skuChanges.slice(i, i + 25);
  const r = await gql(`mutation($pid:ID!,$v:[ProductVariantsBulkInput!]!){ productVariantsBulkUpdate(productId:$pid, variants:$v){ userErrors{ field message } } }`,
    { pid: gidP, v: chunk.map((c) => ({ id: c.id, inventoryItem: { sku: c.newSku } })) });
  const ue = r.productVariantsBulkUpdate.userErrors;
  if (ue.length) throw new Error(JSON.stringify(ue));
  done += chunk.length; process.stdout.write(`\r  ${done}/${skuChanges.length}`); await sleep(400);
}
console.log('\n✅ A74: Red/Green/Burgundy removed, Blue SKUs filled.');
