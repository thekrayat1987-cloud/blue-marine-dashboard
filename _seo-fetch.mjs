import fs from 'node:fs';
const env = Object.fromEntries(
  fs.readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')]; })
);
const STORE = env.SHOPIFY_STORE_URL, TOKEN = env.SHOPIFY_ACCESS_TOKEN, VER = env.SHOPIFY_API_VERSION || '2024-10';
const base = `https://${STORE}/admin/api/${VER}`;
const headers = { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' };
const api = async (p, o={}) => { const r = await fetch(base+p,{...o,headers}); if(!r.ok) throw new Error(`${r.status} ${await r.text()}`); return r.json(); };
const { themes } = await api('/themes.json');
const main = themes.find(t => t.role === 'main');
console.log(`ACTIVE THEME: "${main.name}" id=${main.id}`);
const { assets } = await api(`/themes/${main.id}/assets.json`);
// show files relevant to SEO/meta/structured-data
const rel = assets.map(a=>a.key).filter(k => /meta|seo|head|product|index|json-ld|schema|theme\.liquid|card/i.test(k)).sort();
console.log('\nRELEVANT ASSETS:'); rel.forEach(k=>console.log('  '+k));
fs.mkdirSync(new URL('./theme-dump/', import.meta.url), { recursive: true });
