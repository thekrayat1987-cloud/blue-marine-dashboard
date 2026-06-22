#!/usr/bin/env node
/** Inspect A165 – روان بشت طقم ٣ قطع — dump everything to diagnose the issue. */
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

// Find by SKU A165 or by title
const q = `query($query:String!){
  products(first:5, query:$query){
    edges{ node{
      id legacyResourceId title handle status totalInventory
      productType vendor tags createdAt updatedAt publishedAt
      onlineStoreUrl
      options{ name values }
      featuredImage{ url }
      images(first:20){ edges{ node{ url altText } } }
      seo{ title description }
      descriptionHtml
      collections(first:20){ edges{ node{ title handle } } }
      resourcePublicationsCount{ count }
      variants(first:50){ edges{ node{
        id title sku price compareAtPrice inventoryQuantity
        availableForSale inventoryPolicy
        selectedOptions{ name value }
        image{ url }
        inventoryItem{ tracked }
      } } }
    } }
  }
}`;
async function find(query){ const d = await gql(q,{query}); return d.products.edges.map(e=>e.node); }

let nodes = await find('sku:A165');
if(!nodes.length) nodes = await find('title:*روان*');
if(!nodes.length) nodes = await find('A165');
if(!nodes.length){ console.log('NOT FOUND'); process.exit(0); }

for(const p of nodes){
  console.log('='.repeat(70));
  console.log('TITLE   :', p.title);
  console.log('ID      :', p.legacyResourceId, '| handle:', p.handle);
  console.log('STATUS  :', p.status, '| publishedAt:', p.publishedAt);
  console.log('ONLINE  :', p.onlineStoreUrl);
  console.log('PUBLISHED to channels (count):', p.resourcePublicationsCount?.count);
  console.log('TYPE    :', JSON.stringify(p.productType), '| vendor:', p.vendor);
  console.log('TAGS    :', p.tags.join(', '));
  console.log('TOTAL INVENTORY:', p.totalInventory);
  console.log('SEO     :', JSON.stringify(p.seo));
  console.log('FEATURED IMG:', p.featuredImage?.url || 'NONE');
  console.log('IMAGE COUNT :', p.images.edges.length);
  console.log('COLLECTIONS :', p.collections.edges.map(e=>e.node.handle).join(', ') || 'NONE');
  console.log('OPTIONS :', JSON.stringify(p.options));
  console.log('DESC len:', (p.descriptionHtml||'').length, '| has body:', !!(p.descriptionHtml||'').trim());
  console.log('--- VARIANTS (' + p.variants.edges.length + ') ---');
  for(const ve of p.variants.edges){
    const v = ve.node;
    console.log(`  [${v.sku||'no-sku'}] "${v.title}" | price:${v.price} cmp:${v.compareAtPrice} | qty:${v.inventoryQuantity} avail:${v.availableForSale} policy:${v.inventoryPolicy} tracked:${v.inventoryItem?.tracked} | img:${v.image?.url?'Y':'N'} | ${v.selectedOptions.map(o=>o.name+'='+o.value).join(', ')}`);
  }
}
