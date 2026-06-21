import fs from 'node:fs';
const env = Object.fromEntries(
  fs.readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const STORE = env.SHOPIFY_STORE_URL, TOKEN = env.SHOPIFY_ACCESS_TOKEN, VER = env.SHOPIFY_API_VERSION || '2024-10';
const base = `https://${STORE}/admin/api/${VER}`;
const headers = { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' };
async function rest(p, o = {}) { const r = await fetch(base + p, { ...o, headers }); if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); return r.json(); }

// find A164 (a 2-piece bisht set with Fabric option)
const { products } = await rest('/products.json?limit=20&order=created_at desc&fields=id,title,handle,options,variants,body_html,product_type,vendor,tags,template_suffix');
const p = products.find((x) => x.title.startsWith('A164')) || products[0];
console.log('TITLE:', p.title, '| id', p.id, '| type:', p.product_type, '| template_suffix:', p.template_suffix);
console.log('\nOPTIONS:');
for (const o of p.options) console.log(`  ${o.name}: [${o.values.join(', ')}]`);
console.log('\nSAMPLE VARIANTS (first 3):');
for (const v of p.variants.slice(0, 3)) console.log(`  ${v.option1}/${v.option2}/${v.option3}  sku=${v.sku} price=${v.price} qty=${v.inventory_quantity} mgmt=${v.inventory_management} policy=${v.inventory_policy} weight=${v.weight}${v.weight_unit}`);
console.log('\ntotal variants:', p.variants.length);
console.log('\n=== BODY_HTML (A164) ===\n');
console.log(p.body_html);

// next free product code: scan all A-codes
const all = await rest('/products.json?limit=250&fields=id,title');
const nums = all.products.map((x) => { const m = x.title.match(/^A(\d{3})/); return m ? parseInt(m[1]) : 0; }).filter(Boolean).sort((a, b) => a - b);
console.log('\nhighest A-code:', 'A' + nums[nums.length - 1], '| next free:', 'A' + (nums[nums.length - 1] + 1));

// metafields on A164
const { metafields } = await rest(`/products/${p.id}/metafields.json`);
console.log('\nMETAFIELDS:', metafields.map((m) => `${m.namespace}.${m.key}=${String(m.value).slice(0, 60)}`).join('\n  '));
