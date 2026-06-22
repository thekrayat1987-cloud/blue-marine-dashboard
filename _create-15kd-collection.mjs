#!/usr/bin/env node
/** Create a manual collection of all active products priced 15 KWD and under, then publish it. */
import fs from 'node:fs';
const env = Object.fromEntries(
  fs.readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const STORE = env.SHOPIFY_STORE_URL, TOKEN = env.SHOPIFY_ACCESS_TOKEN, VER = env.SHOPIFY_API_VERSION || '2024-10';
const base = `https://${STORE}/admin/api/${VER}`;
const headers = { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' };
async function gql(q, v = {}) { const r = await fetch(`${base}/graphql.json`, { method: 'POST', headers, body: JSON.stringify({ query: q, variables: v }) }); const j = await r.json(); if (j.errors) throw new Error('GQL: ' + JSON.stringify(j.errors)); return j.data; }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const chunk = (arr, n) => arr.reduce((a, _, i) => (i % n ? a : [...a, arr.slice(i, i + n)]), []);

const TITLE = '15 KD & Under';
const PRICE_CAP = 15;

// 1. Collect all active products whose MAX variant price <= 15
const scanQ = `query($cursor:String){ products(first:100, after:$cursor, query:"status:active"){ pageInfo{ hasNextPage endCursor } edges{ node{ id title productType priceRangeV2{ maxVariantPrice{ amount } } } } } }`;
let cursor = null, ids = [], list = [];
do {
  const d = await gql(scanQ, { cursor });
  for (const e of d.products.edges) {
    if (parseFloat(e.node.priceRangeV2.maxVariantPrice.amount) <= PRICE_CAP) { ids.push(e.node.id); list.push(e.node.title); }
  }
  cursor = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
} while (cursor);
console.log(`Eligible products (<=${PRICE_CAP} KWD): ${ids.length}`);

// 2. Create the manual collection
const createM = `mutation($input:CollectionInput!){ collectionCreate(input:$input){ collection{ id handle title } userErrors{ field message } } }`;
const cr = await gql(createM, { input: { title: TITLE, descriptionHtml: '<p>Daraas at 15 KD and under.</p>' } });
if (cr.collectionCreate.userErrors.length) throw new Error(JSON.stringify(cr.collectionCreate.userErrors));
const coll = cr.collectionCreate.collection;
console.log(`Created collection: ${coll.title}  (${coll.handle})  ${coll.id}`);

// 3. Add products (max 250 per call; chunk at 100)
const addM = `mutation($id:ID!, $productIds:[ID!]!){ collectionAddProducts(id:$id, productIds:$productIds){ collection{ id } userErrors{ field message } } }`;
let added = 0;
for (const batch of chunk(ids, 100)) {
  const r = await gql(addM, { id: coll.id, productIds: batch });
  if (r.collectionAddProducts.userErrors.length) console.log('  add errors:', JSON.stringify(r.collectionAddProducts.userErrors));
  added += batch.length;
  await sleep(400);
}
console.log(`Added ${added} products.`);

// 4. Publish to all available publications (sales channels) so Meta catalog can use it
const pubsQ = `query{ publications(first:25){ edges{ node{ id name } } } }`;
const pubs = (await gql(pubsQ)).publications.edges.map(e => e.node);
const publishM = `mutation($id:ID!, $input:[PublicationInput!]!){ publishablePublish(id:$id, input:$input){ userErrors{ field message } } }`;
const pr = await gql(publishM, { id: coll.id, input: pubs.map(p => ({ publicationId: p.id })) });
if (pr.publishablePublish.userErrors.length) console.log('  publish errors:', JSON.stringify(pr.publishablePublish.userErrors));
console.log(`Published to ${pubs.length} channels: ${pubs.map(p=>p.name).join(', ')}`);
console.log(`\nAdmin URL: https://${STORE}/admin/collections/${coll.id.split('/').pop()}`);
