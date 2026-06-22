import fs from 'node:fs';
const env=Object.fromEntries(fs.readFileSync(new URL('./.env.local',import.meta.url),'utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const STORE=env.SHOPIFY_STORE_URL,TOKEN=env.SHOPIFY_ACCESS_TOKEN,VER=env.SHOPIFY_API_VERSION||'2024-10';
const base=`https://${STORE}/admin/api/${VER}`,headers={'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'};
const api=async(p,o={})=>{const r=await fetch(base+p,{...o,headers});if(!r.ok)throw new Error(`${r.status} ${await r.text()}`);return r.json();};
const APPLY=process.argv.includes('--apply');
const {themes}=await api('/themes.json');const main=themes.find(t=>t.role==='main');
const get=async k=>(await api(`/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(k)}`)).asset.value;
const put=async(k,v)=>api(`/themes/${main.id}/assets.json`,{method:'PUT',body:JSON.stringify({asset:{key:k,value:v}})});

// 1) inject render into _product-details.liquid before content_for 'blocks'
const PD='blocks/_product-details.liquid';
const pdv=await get(PD);
const ANCHOR="    {% content_for 'blocks' %}";
const RENDER="    {% render 'bm-review-stars', product: closest.product %}\n";
let pdNew=pdv, pdMsg;
if(pdv.includes('bm-review-stars')) pdMsg='already injected';
else if(pdv.split(ANCHOR).length-1===1){ pdNew=pdv.replace(ANCHOR, RENDER+ANCHOR); pdMsg='inject render before content_for'; }
else pdMsg='!! anchor count='+(pdv.split(ANCHOR).length-1);

// 2) clean leftover review_stars_seo from product.json
const PK='templates/product.json';
const pjraw=await get(PK); const pj=JSON.parse(pjraw);
let removed=false;
(function rm(n){if(n&&n.blocks){if(n.blocks['review_stars_seo']){delete n.blocks['review_stars_seo'];const i=n.block_order?.indexOf('review_stars_seo');if(i>=0)n.block_order.splice(i,1);removed=true;}for(const b of Object.values(n.blocks))rm(b);}})(pj.sections.main);
const pjnew=JSON.stringify(pj,null,2);

console.log('1) '+PD+' -> '+pdMsg);
console.log('2) '+PK+' -> remove review_stars_seo: '+removed);
if(!APPLY){console.log('\nDRY-RUN. add --apply');process.exit(0);}
if(pdMsg==='inject render before content_for'){fs.writeFileSync(new URL('./theme-dump/backups/blocks___product-details.liquid.pre-stars.bak',import.meta.url),pdv);await put(PD,pdNew);console.log('✅ _product-details.liquid updated');}
if(removed){await put(PK,pjnew);console.log('✅ product.json cleaned');}
