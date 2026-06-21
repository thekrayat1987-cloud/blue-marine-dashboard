import fs from 'node:fs';

// --- load env ---
const env = Object.fromEntries(
  fs.readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

const STORE = env.SHOPIFY_STORE_URL;
const TOKEN = env.SHOPIFY_ACCESS_TOKEN;
const VER = env.SHOPIFY_API_VERSION || '2024-10';
const APPLY = process.argv.includes('--apply');

const base = `https://${STORE}/admin/api/${VER}`;
const headers = { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' };

async function api(path, opts = {}) {
  const res = await fetch(base + path, { ...opts, headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  return res.json();
}

// The exact target selector + its !important Cairo rule (Arabic-only block in theme.liquid)
const TARGET = 'html, body, *:not(.price):not(.money) {';
const REPLACEMENT = 'html, body, *:not(.price):not(.money):not(.jdgm-star) {';

const { themes } = await api('/themes.json');
const main = themes.find((t) => t.role === 'main');
console.log(`Active theme: "${main.name}" (id ${main.id}, role ${main.role})`);

const key = 'layout/theme.liquid';
const { asset } = await api(`/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}`);
const value = asset.value;

const count = value.split(TARGET).length - 1;
console.log(`Occurrences of target selector: ${count}`);
if (count === 0) {
  console.log('Target not found — already fixed or selector changed. Searching for jdgm-star exclusion...');
  console.log('Has :not(.jdgm-star)?', value.includes(':not(.jdgm-star)'));
  process.exit(1);
}

// show context
const idx = value.indexOf(TARGET);
console.log('\n--- context (current) ---');
console.log(value.slice(idx - 40, idx + 120));
console.log('--- end context ---\n');

const updated = value.split(TARGET).join(REPLACEMENT);

if (!APPLY) {
  console.log('DRY RUN. Proposed line ->', REPLACEMENT);
  console.log('Re-run with --apply to write to the live theme.');
  process.exit(0);
}

// backup
const stamp = process.env.STAMP || 'manual';
fs.writeFileSync(new URL(`./theme.liquid.bak.${stamp}.liquid`, import.meta.url), value);
console.log(`Backup written: theme.liquid.bak.${stamp}.liquid`);

await api(`/themes/${main.id}/assets.json`, {
  method: 'PUT',
  body: JSON.stringify({ asset: { key, value: updated } }),
});
console.log('✅ Applied. theme.liquid updated on live theme.');
