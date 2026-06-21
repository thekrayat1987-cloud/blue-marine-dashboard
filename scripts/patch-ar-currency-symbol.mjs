#!/usr/bin/env node
/**
 * Inject AR-only client-side currency relabel: "KD" → "د.ك".
 *
 * Why client-side (not Shopify money_format):
 *   money_format is shop-wide. We only want the swap when locale=ar.
 *   English visitors keep "KD 35.000". Arabic visitors see "د.ك 35.000".
 *
 * Idempotent: looks for the marker `bm-ar-currency:` in theme.liquid;
 * if found, refreshes the block. Otherwise injects before the closing
 * `{% endif %}` of the existing `request.locale.iso_code == 'ar'` block.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const THEME_ID = process.env.SHOPIFY_THEME_ID || "182480240940";
if (!STORE || !TOKEN) {
  console.error("Missing SHOPIFY_STORE_URL or SHOPIFY_ACCESS_TOKEN");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const KEY = "layout/theme.liquid";
const BASE = `https://${STORE}/admin/api/${VERSION}/themes/${THEME_ID}/assets.json`;
const HDR = { "X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json" };

const MARKER_OPEN = "<!-- bm-ar-currency:start -->";
const MARKER_CLOSE = "<!-- bm-ar-currency:end -->";

const BLOCK = `${MARKER_OPEN}
<script>
(function () {
  'use strict';
  // Only run on the Arabic storefront. Inside the AR Liquid conditional already,
  // but we double-check via <html lang="ar"> for safety with cached HTML.
  var lang = (document.documentElement.lang || '').toLowerCase();
  if (lang !== 'ar' && lang.indexOf('ar-') !== 0) return;

  var FROM = /\\bKD\\b/g;
  var TO = 'د.ك'; // د.ك

  function patchTextNode(n) {
    var v = n.nodeValue;
    if (!v || v.indexOf('KD') === -1) return;
    var nv = v.replace(FROM, TO);
    if (nv !== v) n.nodeValue = nv;
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { patchTextNode(root); return; }
    if (root.nodeType !== 1) return;
    // Skip script/style — currency never appears there
    var tag = root.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        var pt = p.tagName;
        if (pt === 'SCRIPT' || pt === 'STYLE' || pt === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
        return n.nodeValue && n.nodeValue.indexOf('KD') !== -1
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    });
    var n;
    while ((n = w.nextNode())) patchTextNode(n);
  }

  function run() { walk(document.body); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  // Catch dynamic re-renders (cart drawer, quickview, sort, AJAX paginate)
  var mo = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      if (m.type === 'characterData') { patchTextNode(m.target); continue; }
      var added = m.addedNodes;
      for (var j = 0; j < added.length; j++) walk(added[j]);
    }
  });
  function startObserver() {
    if (!document.body) return;
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.body) startObserver();
  else document.addEventListener('DOMContentLoaded', startObserver);
})();
</script>
${MARKER_CLOSE}`;

async function getAsset(key) {
  const r = await fetch(BASE + "?asset[key]=" + encodeURIComponent(key), { headers: HDR });
  if (!r.ok) throw new Error(`GET ${key} ${r.status}: ${await r.text()}`);
  return (await r.json()).asset.value;
}
async function putAsset(key, value) {
  const r = await fetch(BASE, { method: "PUT", headers: HDR, body: JSON.stringify({ asset: { key, value } }) });
  if (!r.ok) throw new Error(`PUT ${key} ${r.status}: ${await r.text()}`);
}

function patch(theme) {
  // Refresh the cache-bust marker so Shopify page_cache flushes
  const stamp = `<!-- bm-ar-currency-bust:${new Date().toISOString()} -->`;
  let next = theme.replace(/<!-- bm-ar-currency-bust:[^>]*-->\n?/g, "");

  if (next.includes(MARKER_OPEN) && next.includes(MARKER_CLOSE)) {
    // Replace existing block in place
    const re = new RegExp(
      MARKER_OPEN.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&") +
        "[\\s\\S]*?" +
        MARKER_CLOSE.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&"),
      "m",
    );
    next = next.replace(re, BLOCK);
    return { content: next + "\n" + stamp + "\n", action: "refreshed-block" };
  }

  // Inject inside the existing AR conditional, just before its `{% endif %}`.
  // The AR conditional starts at: `{% if request.locale.iso_code == 'ar' %}`
  // and we want to put the script right before the matching `{% endif %}`
  // that comes AFTER the `</style>` of that block.
  const arOpenIdx = next.indexOf("{% if request.locale.iso_code == 'ar' %}");
  if (arOpenIdx < 0) throw new Error("AR conditional opener not found in theme.liquid");

  // Find the </style> after arOpenIdx, then the next {% endif %} after that
  const afterOpen = next.slice(arOpenIdx);
  const styleCloseRel = afterOpen.indexOf("</style>");
  if (styleCloseRel < 0) throw new Error("</style> after AR opener not found");
  const styleCloseAbs = arOpenIdx + styleCloseRel + "</style>".length;
  const endifRel = next.slice(styleCloseAbs).indexOf("{% endif %}");
  if (endifRel < 0) throw new Error("{% endif %} after AR </style> not found");
  const endifAbs = styleCloseAbs + endifRel;

  next = next.slice(0, endifAbs) + BLOCK + "\n" + next.slice(endifAbs);
  return { content: next + "\n" + stamp + "\n", action: "injected-block" };
}

const theme = await getAsset(KEY);
const { content, action } = patch(theme);

console.log(`— AR currency-symbol patch (theme ${THEME_ID}) —`);
console.log(`  action: ${action}`);
console.log(`  size: ${theme.length} → ${content.length}`);

if (!apply) {
  console.log("\n[dry-run] Re-run with --apply to push.");
  // Save preview
  const tmp = "/tmp/theme.liquid.preview";
  writeFileSync(tmp, content);
  console.log(`  preview written → ${tmp}`);
  process.exit(0);
}

// Backup
const backupDir = resolve(__dirname, "..", "..", "shopify-snippets", "backups");
if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = join(backupDir, `theme.liquid.pre-ar-currency_${stamp}.liquid`);
writeFileSync(backupPath, theme);
console.log(`  backup → ${backupPath}`);

await putAsset(KEY, content);
console.log("\n✓ theme.liquid updated. Hard-reload bluemarineatelier.com/ar to verify.");
