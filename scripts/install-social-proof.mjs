// Blue Marine — install (or remove) the simulated social-proof widget on the live theme.
//
// What it does (apply mode):
//   1. Uploads snippets/blue-marine-social-proof.liquid to the live theme.
//   2. Adds `{% render 'blue-marine-social-proof' %}` to layout/theme.liquid right before </body>.
//   3. Saves a timestamped backup of theme.liquid under shopify-snippets/backups/ first.
//
// Usage from dashboard/:
//   Dry-run (default — shows what would change, no writes):
//     node --env-file=.env.local scripts/install-social-proof.mjs
//
//   Apply:
//     node --env-file=.env.local scripts/install-social-proof.mjs --apply
//
//   Uninstall (removes the render line + deletes the snippet asset):
//     node --env-file=.env.local scripts/install-social-proof.mjs --uninstall
//     node --env-file=.env.local scripts/install-social-proof.mjs --uninstall --apply

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const THEME_ID = process.env.SHOPIFY_THEME_ID || "182480240940";

if (!STORE || !TOKEN) {
  console.error("Missing SHOPIFY_STORE_URL or SHOPIFY_ACCESS_TOKEN.");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const uninstall = process.argv.includes("--uninstall");

const SNIPPET_KEY = "snippets/blue-marine-social-proof.liquid";
const THEME_KEY = "layout/theme.liquid";
const RENDER_LINE = "    {% render 'blue-marine-social-proof' %}";
const RENDER_NEEDLE = "render 'blue-marine-social-proof'";

const BASE = `https://${STORE}/admin/api/${VERSION}/themes/${THEME_ID}/assets.json`;
const HEADERS = { "X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json" };

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const LOCAL_SNIPPET = join(REPO_ROOT, "shopify-snippets", "blue-marine-social-proof.liquid");
const BACKUP_DIR = join(REPO_ROOT, "shopify-snippets", "backups");

async function getAsset(key) {
  const url = `${BASE}?asset[key]=${encodeURIComponent(key)}`;
  const r = await fetch(url, { headers: HEADERS });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GET ${key} ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return d.asset?.value ?? null;
}

async function putAsset(key, value) {
  const r = await fetch(BASE, {
    method: "PUT",
    headers: HEADERS,
    body: JSON.stringify({ asset: { key, value } }),
  });
  if (!r.ok) throw new Error(`PUT ${key} ${r.status}: ${await r.text()}`);
  return r.json();
}

async function deleteAsset(key) {
  const url = `${BASE}?asset[key]=${encodeURIComponent(key)}`;
  const r = await fetch(url, { method: "DELETE", headers: HEADERS });
  if (r.status === 404) return false;
  if (!r.ok) throw new Error(`DELETE ${key} ${r.status}: ${await r.text()}`);
  return true;
}

function ts() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function backupTheme(content, label) {
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
  const path = join(BACKUP_DIR, `theme.liquid.${label}_${ts()}.liquid`);
  writeFileSync(path, content);
  return path;
}

const CACHE_BUST_RE = /\{%-?\s*comment\s*-?%\}sp-cache-bust:[^{]*\{%-?\s*endcomment\s*-?%\}\n?/g;

function patchThemeLiquid(content) {
  let body = content.replace(CACHE_BUST_RE, "");
  const stamp = `{%- comment -%}sp-cache-bust:${new Date().toISOString()}{%- endcomment -%}\n`;
  body = stamp + body;

  if (body.includes(RENDER_NEEDLE)) {
    return { content: body, added: false, busted: true, reason: "render line already present (cache-bust marker refreshed)" };
  }
  const lines = body.split("\n");
  const idx = lines.findIndex((l) => /<\/body>/i.test(l));
  if (idx < 0) throw new Error("Could not find </body> in theme.liquid");
  lines.splice(idx, 0, RENDER_LINE);
  return { content: lines.join("\n"), added: true, busted: true, line: idx + 1 };
}

function unpatchThemeLiquid(content) {
  if (!content.includes(RENDER_NEEDLE)) {
    return { content, removed: false, reason: "render line not present" };
  }
  const lines = content.split("\n").filter((l) => !l.includes(RENDER_NEEDLE));
  return { content: lines.join("\n"), removed: true };
}

async function runInstall() {
  if (!existsSync(LOCAL_SNIPPET)) {
    throw new Error(`Local snippet missing: ${LOCAL_SNIPPET}`);
  }
  const localValue = readFileSync(LOCAL_SNIPPET, "utf8");

  const remoteSnippet = await getAsset(SNIPPET_KEY);
  const snippetChanged = remoteSnippet !== localValue;

  const theme = await getAsset(THEME_KEY);
  if (!theme) throw new Error("theme.liquid not found");
  const patched = patchThemeLiquid(theme);

  console.log(`\n— Social-proof install (theme ${THEME_ID}) —`);
  console.log(`  snippet ${SNIPPET_KEY}: ${
    remoteSnippet === null ? "MISSING (will create)" :
    snippetChanged ? `DIFFERS (${remoteSnippet.length}→${localValue.length} chars)` :
    "up to date"
  }`);
  console.log(`  theme.liquid: ${
    patched.added ? `INJECT '${RENDER_LINE.trim()}' before line ${patched.line} + cache-bust marker` :
    "already contains render line — refresh cache-bust marker (forces page_cache flush)"
  }`);

  if (!apply) {
    console.log("\n[dry-run] no changes pushed. Re-run with --apply to install.");
    return;
  }

  if (snippetChanged || remoteSnippet === null) {
    await putAsset(SNIPPET_KEY, localValue);
    console.log(`✓ uploaded ${SNIPPET_KEY}`);
  }
  if (patched.added) {
    const backupPath = backupTheme(theme, "presp");
    console.log(`✓ backup saved → ${backupPath}`);
  }
  await putAsset(THEME_KEY, patched.content);
  console.log(`✓ updated ${THEME_KEY} (${patched.added ? "added render line + " : ""}refreshed cache-bust marker)`);
  console.log("\n🎉 Social proof installed. Cache will refresh within ~10s. Hard-reload bluemarineatelier.com to see it.");
}

async function runUninstall() {
  const theme = await getAsset(THEME_KEY);
  if (!theme) throw new Error("theme.liquid not found");
  const unpatched = unpatchThemeLiquid(theme);
  const remoteSnippet = await getAsset(SNIPPET_KEY);

  console.log(`\n— Social-proof uninstall (theme ${THEME_ID}) —`);
  console.log(`  theme.liquid: ${
    unpatched.removed ? "REMOVE render line" : "no render line present"
  }`);
  console.log(`  snippet ${SNIPPET_KEY}: ${
    remoteSnippet === null ? "absent" : "DELETE"
  }`);

  if (!apply) {
    console.log("\n[dry-run] no changes pushed. Re-run with --apply to uninstall.");
    return;
  }

  if (unpatched.removed) {
    const backupPath = backupTheme(theme, "prespremove");
    console.log(`✓ backup saved → ${backupPath}`);
    await putAsset(THEME_KEY, unpatched.content);
    console.log(`✓ patched ${THEME_KEY} (removed render line)`);
  }
  if (remoteSnippet !== null) {
    await deleteAsset(SNIPPET_KEY);
    console.log(`✓ deleted ${SNIPPET_KEY}`);
  }
  console.log("\n🧹 Social proof uninstalled.");
}

(uninstall ? runUninstall() : runInstall()).catch((e) => {
  console.error("\n❌", e.message);
  process.exit(1);
});
