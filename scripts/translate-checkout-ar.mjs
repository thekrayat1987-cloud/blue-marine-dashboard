#!/usr/bin/env node
/**
 * Translate all Shopify checkout/system strings to Arabic.
 *
 * Pipeline:
 *   1. Fetch translatableContent for OnlineStoreThemeLocaleContent
 *   2. Filter to "shopify.checkout.*" keys
 *   3. Dedupe by EN value (many keys share the same source)
 *   4. Translate unique EN values via Gemini (batches of 30)
 *   5. Validate placeholders survived translation (%{...}, {{...}}, HTML)
 *   6. Push to Shopify via translationsRegister (batches of 100)
 *   7. Checkpoint to scripts/.checkout-ar-checkpoint.json after each batch
 *
 * Resumable: re-running skips work already in checkpoint.
 *
 * Flags:
 *   --dry-run       Translate + print, do NOT push to Shopify
 *   --limit=N       Process only N unique values (testing)
 *   --reset         Ignore checkpoint and start fresh
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const RESET = args.has("--reset");
const LIMIT = (() => {
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--limit=(\d+)$/);
    if (m) return Number(m[1]);
  }
  return null;
})();

const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const SHOPIFY_URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_FALLBACK = "gemini-2.5-flash-lite";
const GEMINI_URL = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

const RID = "gid://shopify/OnlineStoreThemeLocaleContent/182480240940";
const CHECKPOINT_PATH = resolve(__dirname, ".checkout-ar-checkpoint.json");

const TRANSLATE_BATCH = 30; // strings per Gemini call
const PUSH_BATCH = 100; // Shopify translationsRegister max per call (100 is safe)
const GEMINI_RPM_DELAY = 1100; // ~55 RPM, well under flash limit

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shopifyGql(query, variables) {
  const r = await fetch(SHOPIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error("Shopify GQL: " + JSON.stringify(j.errors));
  return j.data;
}

// ---------------------------------------------------------------------------
// Placeholder preservation
// ---------------------------------------------------------------------------
// Captures the kinds of tokens Gemini must NOT translate / alter:
//   %{name}      Shopify ICU vars
//   {{ var }}    Liquid vars
//   {0} {1}      positional indices
//   <a> </a>     simple HTML tags
//   &amp;        entities
function extractPlaceholders(s) {
  const out = [];
  const patterns = [/%\{[^}]+\}/g, /\{\{[^}]+\}\}/g, /\{[0-9]+\}/g, /<\/?[a-zA-Z][^>]*>/g, /&[a-z]+;/g];
  for (const p of patterns) {
    const matches = s.match(p);
    if (matches) out.push(...matches);
  }
  return out.sort();
}

function placeholdersMatch(en, ar) {
  const a = extractPlaceholders(en);
  const b = extractPlaceholders(ar);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Gemini batch translation
// ---------------------------------------------------------------------------
async function geminiTranslateBatch(items, attempt = 0) {
  // items: [{ id, en }]
  const prompt = `You are translating UI strings for the Arabic checkout of "Atelier Blue Marine", a Kuwait luxury fashion store.

ABSOLUTE RULES:
1. Translate the "en" English text to natural, formal Modern Standard Arabic suitable for a luxury Kuwaiti shopping experience.
2. Preserve EXACTLY any placeholder tokens — do NOT translate them, do NOT add/remove spaces inside them. Tokens look like:
   %{name}    {{ variable }}    {0}    {1}    <a>   </a>   <strong>   &amp;
3. Keep punctuation style appropriate for Arabic (use Arabic comma ، and question mark ؟ where natural).
4. Numbers and currency codes: keep as in source.
5. UI strings are short — keep translations concise. Do NOT add explanatory words.
6. For accessibility labels (sr-only style), translate descriptively but briefly.
7. If the English contains an HTML tag like <a href="...">, keep the entire tag and its attributes UNCHANGED, only translate the visible text.

Translate the following ${items.length} strings. Return ONLY a JSON array with one object per input, in the same order, with fields { "id": <number>, "ar": "<arabic translation>" }. No prose, no markdown, no code fences.

INPUT:
${JSON.stringify(items, null, 2)}`;

  const model = attempt === 0 ? GEMINI_MODEL : GEMINI_FALLBACK;
  const r = await fetch(GEMINI_URL(model), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!r.ok) {
    const body = await r.text();
    if (attempt < 2 && (r.status === 503 || r.status === 429 || r.status >= 500)) {
      const wait = 2000 * (attempt + 1);
      console.warn(`  Gemini ${r.status}, retrying in ${wait}ms (attempt ${attempt + 2})`);
      await sleep(wait);
      return geminiTranslateBatch(items, attempt + 1);
    }
    throw new Error(`Gemini ${r.status}: ${body.slice(0, 300)}`);
  }

  const j = await r.json();
  const text = j.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    if (attempt < 2) {
      console.warn(`  Gemini returned non-JSON, retrying (attempt ${attempt + 2})`);
      await sleep(1500);
      return geminiTranslateBatch(items, attempt + 1);
    }
    throw new Error("Gemini returned non-JSON: " + text.slice(0, 200));
  }
  if (!Array.isArray(parsed)) throw new Error("Gemini did not return array");
  return parsed;
}

// ---------------------------------------------------------------------------
// Shopify push (translationsRegister)
// ---------------------------------------------------------------------------
async function pushTranslations(translations) {
  // translations: [{ locale, key, value, translatableContentDigest }]
  const data = await shopifyGql(
    `mutation Push($id: ID!, $t: [TranslationInput!]!) {
      translationsRegister(resourceId: $id, translations: $t) {
        translations { key locale }
        userErrors { field message }
      }
    }`,
    { id: RID, t: translations },
  );
  return data.translationsRegister;
}

// ---------------------------------------------------------------------------
// Checkpoint
// ---------------------------------------------------------------------------
function loadCheckpoint() {
  if (RESET || !existsSync(CHECKPOINT_PATH)) return { translatedByEn: {}, pushedKeys: [] };
  return JSON.parse(readFileSync(CHECKPOINT_PATH, "utf8"));
}
function saveCheckpoint(cp) {
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp, null, 2));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}${LIMIT ? ` limit=${LIMIT}` : ""}${RESET ? " RESET" : ""}`);
console.log("Fetching translatable content from Shopify...");

const data = await shopifyGql(
  `query($id: ID!) {
    translatableResource(resourceId: $id) {
      translatableContent { key value digest type }
    }
  }`,
  { id: RID },
);

const all = data.translatableResource.translatableContent;
const checkout = all.filter((c) => c.key.startsWith("shopify.checkout."));
console.log(`Total checkout keys: ${checkout.length}`);

// Skip empty values
const work = checkout.filter((c) => c.value && String(c.value).trim().length > 0);
console.log(`Non-empty: ${work.length}`);

// Dedupe by EN value
const byEn = new Map(); // en -> [{key, digest}]
for (const c of work) {
  if (!byEn.has(c.value)) byEn.set(c.value, []);
  byEn.get(c.value).push({ key: c.key, digest: c.digest });
}
console.log(`Unique EN values: ${byEn.size}`);

const cp = loadCheckpoint();
const allEnValues = [...byEn.keys()];
const todo = allEnValues.filter((en) => !(en in cp.translatedByEn));
console.log(`Already translated (checkpoint): ${allEnValues.length - todo.length}`);
console.log(`To translate: ${todo.length}`);

const slice = LIMIT ? todo.slice(0, LIMIT) : todo;
console.log(`Processing this run: ${slice.length}\n`);

// ---------------------------------------------------------------------------
// Translate in batches
// ---------------------------------------------------------------------------
let batchN = 0;
const totalBatches = Math.ceil(slice.length / TRANSLATE_BATCH);
for (let i = 0; i < slice.length; i += TRANSLATE_BATCH) {
  batchN++;
  const chunk = slice.slice(i, i + TRANSLATE_BATCH);
  const items = chunk.map((en, idx) => ({ id: idx, en }));
  process.stdout.write(`[${batchN}/${totalBatches}] Translating ${chunk.length} strings... `);

  let translations;
  try {
    translations = await geminiTranslateBatch(items);
  } catch (e) {
    console.log(`FAIL: ${e.message}`);
    continue;
  }

  let kept = 0;
  for (const t of translations) {
    const en = chunk[t.id];
    if (typeof en !== "string" || typeof t.ar !== "string") continue;
    if (!placeholdersMatch(en, t.ar)) {
      console.warn(`\n  ⚠ placeholder mismatch, keeping EN: ${JSON.stringify(en).slice(0, 60)}`);
      cp.translatedByEn[en] = en; // fallback to EN
      continue;
    }
    cp.translatedByEn[en] = t.ar;
    kept++;
  }
  console.log(`ok (${kept}/${chunk.length})`);
  saveCheckpoint(cp);
  if (i + TRANSLATE_BATCH < slice.length) await sleep(GEMINI_RPM_DELAY);
}

console.log(`\nTranslated total: ${Object.keys(cp.translatedByEn).length}`);

// ---------------------------------------------------------------------------
// Build translation payload (key-level)
// ---------------------------------------------------------------------------
const pushedSet = new Set(cp.pushedKeys);
const payload = [];
for (const [en, locs] of byEn.entries()) {
  const ar = cp.translatedByEn[en];
  if (!ar) continue;
  if (ar === en) continue; // skip when fallback equaled EN (no improvement)
  for (const { key, digest } of locs) {
    if (pushedSet.has(key)) continue;
    payload.push({ locale: "ar", key, value: ar, translatableContentDigest: digest });
  }
}
console.log(`Translations ready to push: ${payload.length}`);

if (DRY_RUN) {
  console.log("\n--- DRY RUN sample (first 10) ---");
  for (const p of payload.slice(0, 10)) {
    console.log(`  ${p.key}\n    ${JSON.stringify(p.value).slice(0, 100)}`);
  }
  console.log("\nDry run complete — no Shopify writes performed.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Push to Shopify
// ---------------------------------------------------------------------------
console.log("\nPushing to Shopify...");
let pushed = 0;
const totalPushBatches = Math.ceil(payload.length / PUSH_BATCH);
for (let i = 0; i < payload.length; i += PUSH_BATCH) {
  const slice = payload.slice(i, i + PUSH_BATCH);
  const n = Math.floor(i / PUSH_BATCH) + 1;
  process.stdout.write(`[${n}/${totalPushBatches}] Pushing ${slice.length}... `);
  try {
    const res = await pushTranslations(slice);
    if (res.userErrors.length) {
      console.log(`partial: ${res.userErrors.length} errors`);
      for (const e of res.userErrors.slice(0, 3))
        console.log(`   ${e.field?.join(".")} :: ${e.message}`);
    } else {
      console.log("ok");
    }
    for (const t of slice) cp.pushedKeys.push(t.key);
    pushed += slice.length;
    saveCheckpoint(cp);
  } catch (e) {
    console.log(`FAIL: ${e.message}`);
    await sleep(2000);
  }
  await sleep(300); // gentle on Shopify
}

console.log(`\nDone. Pushed ${pushed} translations across ${totalPushBatches} batches.`);
console.log(`Checkpoint saved at: ${CHECKPOINT_PATH}`);
