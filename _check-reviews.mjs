import fs from 'node:fs';
const env=Object.fromEntries(fs.readFileSync(new URL('./.env.local',import.meta.url),'utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const STORE=env.SHOPIFY_STORE_URL,TOKEN=env.SHOPIFY_ACCESS_TOKEN,VER=env.SHOPIFY_API_VERSION||'2024-10';
const gql=async(q,v)=>{const r=await fetch(`https://${STORE}/admin/api/${VER}/graphql.json`,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q,variables:v})});const j=await r.json();if(j.errors)throw new Error(JSON.stringify(j.errors));return j.data;};
// scan products for judge.me metafields (reviews namespace)
let cursor=null, total=0, withRating=0, samples=[];
do{
  const d=await gql(`query($c:String){products(first:100,after:$c){pageInfo{hasNextPage endCursor} nodes{title handle mf_rating:metafield(namespace:"reviews",key:"rating"){value} mf_count:metafield(namespace:"reviews",key:"rating_count"){value}}}}`,{c:cursor});
  for(const p of d.products.nodes){total++; if(p.mf_count && p.mf_count.value && Number(p.mf_count.value)>0){withRating++; if(samples.length<8) samples.push({h:p.handle, rating:p.mf_rating?.value, count:p.mf_count.value});}}
  cursor=d.products.pageInfo.hasNextPage?d.products.pageInfo.endCursor:null;
}while(cursor);
console.log(`Total products: ${total}`);
console.log(`Products with >=1 review (reviews.rating_count metafield): ${withRating}`);
console.log('Samples:'); samples.forEach(s=>console.log('  ', s.h, '| rating=', s.rating, '| count=', s.count));
