import fs from 'node:fs';
const env=Object.fromEntries(fs.readFileSync(new URL('./.env.local',import.meta.url),'utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const STORE=env.SHOPIFY_STORE_URL,TOKEN=env.SHOPIFY_ACCESS_TOKEN,VER=env.SHOPIFY_API_VERSION||'2024-10';
const base=`https://${STORE}/admin/api/${VER}`,headers={'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'};
const api=async(p,o={})=>{const r=await fetch(base+p,{...o,headers});if(!r.ok)throw new Error(`${r.status} ${await r.text()}`);return r.json();};
const APPLY=process.argv.includes('--apply');
const {themes}=await api('/themes.json'); const main=themes.find(t=>t.role==='main');
console.log(`Theme: "${main.name}" (${main.id})  MODE: ${APPLY?'APPLY':'DRY-RUN'}\n`);

const edits=[
  { key:'sections/custom-reels.liquid',
    find:'<h1 class="title">{{section.settings.title}}</h1>',
    repl:'<h2 class="title">{{section.settings.title}}</h2>',
    why:'Demote homepage section heading H1→H2 (keeps visually-hidden brand H1 as sole H1)' },
  { key:'snippets/meta-tags.liquid',
    find:'  assign og_title = page_title | default: shop.name\n',
    repl:'  assign og_title = page_title | default: shop.name\n  unless og_title contains shop.name\n    assign og_title = og_title | append: \' – \' | append: shop.name\n  endunless\n',
    why:'Append brand to og:title/twitter:title to match <title> for richer social shares' },
];

for (const e of edits){
  const {asset}=await api(`/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(e.key)}`);
  const v=asset.value; const n=v.split(e.find).length-1;
  console.log(`--- ${e.key}`); console.log(`    ${e.why}`); console.log(`    matches: ${n}`);
  if(n!==1){ console.log(`    !! expected exactly 1 match, got ${n}. SKIPPING this file.\n`); e._skip=true; continue; }
  const idx=v.indexOf(e.find);
  console.log(`    BEFORE: ${JSON.stringify(v.slice(idx, idx+e.find.length))}`);
  console.log(`    AFTER : ${JSON.stringify(e.repl)}`);
  e._new=v.split(e.find).join(e.repl); e._old=v;
  console.log('');
}

if(!APPLY){ console.log('DRY-RUN complete. Re-run with --apply to write to the live theme.'); process.exit(0); }

fs.mkdirSync(new URL('./theme-dump/backups/',import.meta.url),{recursive:true});
for (const e of edits){
  if(e._skip) continue;
  const bname='backups/'+e.key.replace(/\//g,'__')+'.pre-seo.bak';
  fs.writeFileSync(new URL('./theme-dump/'+bname,import.meta.url), e._old);
  await api(`/themes/${main.id}/assets.json`,{method:'PUT',body:JSON.stringify({asset:{key:e.key,value:e._new}})});
  console.log(`✅ Applied ${e.key} (backup: theme-dump/${bname})`);
}
