import fs from 'node:fs';
const env=Object.fromEntries(fs.readFileSync(new URL('./.env.local',import.meta.url),'utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const STORE=env.SHOPIFY_STORE_URL,TOKEN=env.SHOPIFY_ACCESS_TOKEN,VER=env.SHOPIFY_API_VERSION||'2024-10';
const base=`https://${STORE}/admin/api/${VER}`,headers={'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'};
const api=async(p)=>{const r=await fetch(base+p,{headers});return r.json();};
const {shop}=await api('/shop.json');
console.log('shop.name:', shop.name);
console.log('shop.description:', JSON.stringify(shop.description));
console.log('shop.description length:', (shop.description||'').length);
// GraphQL: shop SEO + homepage SEO via onlineStore? Check shop metafields for seo
const gql=async(q)=>{const r=await fetch(base+'/graphql.json',{method:'POST',headers,body:JSON.stringify({query:q})});return (await r.json());};
const d=await gql(`{ shop { name description } }`);
console.log('GQL shop.description:', JSON.stringify(d.data?.shop?.description||'').slice(0,80));
