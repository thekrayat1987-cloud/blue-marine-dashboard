import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync(new URL('./.env.local', import.meta.url),'utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const STORE=env.SHOPIFY_STORE_URL,TOKEN=env.SHOPIFY_ACCESS_TOKEN,VER=env.SHOPIFY_API_VERSION||'2024-10';
const base=`https://${STORE}/admin/api/${VER}`, headers={'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'};
const api=async(p,o={})=>{const r=await fetch(base+p,{...o,headers});if(!r.ok)throw new Error(`${r.status} ${await r.text()}`);return r.json();};
const { themes } = await api('/themes.json'); const main = themes.find(t=>t.role==='main');
const keys = process.argv.slice(2);
fs.mkdirSync(new URL('./theme-dump/', import.meta.url), { recursive: true });
for (const key of keys) {
  const { asset } = await api(`/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}`);
  const out = key.replace(/\//g,'__');
  fs.writeFileSync(new URL(`./theme-dump/${out}`, import.meta.url), asset.value ?? '');
  console.log(`${key}  ->  ${(asset.value||'').length} bytes`);
}
