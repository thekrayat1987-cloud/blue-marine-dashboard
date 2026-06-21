#!/usr/bin/env node
/**
 * Fill missing alt text on every product image using a bilingual SEO template.
 * One alt per image (Shopify is single-string per file): combine EN title +
 * AR title + Khaleeji daraa keywords so the same alt ranks in both Google EN
 * Image search and Google AR Image search.
 *
 * Format: "{EN title} – {AR title} – Khaleeji daraa درّاعة خليجية فاخرة"
 * For perfume / non-daraa products, the keyword tail adapts.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query, variables) {
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

function classify(handle) {
  const h = handle.toLowerCase();
  if (h.includes("eau-de-parfum") || h.includes("parfum")) return "fragrance";
  if (h.includes("bisht") && (h.includes("set") || h.includes("trio") || h.includes("3-piece") || h.includes("three"))) return "bisht-set";
  if (h.includes("bisht")) return "bisht";
  if (h.includes("3-piece") || h.includes("three-piece")) return "daraa-3-piece";
  if (h.includes("2-piece") || h.includes("two-piece")) return "daraa-2-piece";
  if (h.includes("caftan") || h.includes("kaftan")) return "caftan";
  return "daraa";
}

function buildAlt(enTitle, arTitle, kind) {
  const tail = {
    fragrance: "Atelier Blue Marine luxury perfume عطر فاخر",
    "bisht-set": "Khaleeji bisht set طقم بشت خليجي فاخر",
    bisht: "Khaleeji bisht بشت خليجي فاخر",
    "daraa-3-piece": "3-piece Khaleeji daraa set طقم درّاعة ثلاث قطع",
    "daraa-2-piece": "2-piece Khaleeji daraa set طقم درّاعة قطعتين",
    caftan: "Khaleeji caftan قفطان خليجي فاخر",
    daraa: "Khaleeji daraa درّاعة خليجية فاخرة",
  }[kind];
  const en = (enTitle || "").trim();
  const ar = (arTitle || "").trim();
  if (en && ar && en !== ar) return `${en} – ${ar} – ${tail}`;
  if (en) return `${en} – ${tail}`;
  if (ar) return `${ar} – ${tail}`;
  return tail;
}

// Fetch products with EN + AR titles + media
const products = [];
{
  let after = null;
  while (true) {
    const d = await gql(
      `query($after:String){
        products(first:25, after:$after, query:"status:active OR status:draft"){
          edges{ node{
            id handle title status
            media(first:25){ edges{ node{
              ... on MediaImage { id alt image { url } }
            } } }
          } }
          pageInfo{ hasNextPage endCursor }
        }
      }`,
      { after },
    );
    for (const e of d.products.edges) products.push(e.node);
    if (!d.products.pageInfo.hasNextPage) break;
    after = d.products.pageInfo.endCursor;
    await sleep(120);
  }
}

// Fetch AR titles in bulk via translatableResources
const arTitles = new Map();
{
  let after = null;
  while (true) {
    const d = await gql(
      `query($after:String){
        translatableResources(resourceType: PRODUCT, first:50, after:$after){
          edges{ node{
            resourceId
            translations(locale:"ar"){ key value }
          } }
          pageInfo{ hasNextPage endCursor }
        }
      }`,
      { after },
    );
    for (const e of d.translatableResources.edges) {
      const t = e.node.translations.find((x) => x.key === "title");
      if (t?.value) arTitles.set(e.node.resourceId, t.value);
    }
    if (!d.translatableResources.pageInfo.hasNextPage) break;
    after = d.translatableResources.pageInfo.endCursor;
    await sleep(120);
  }
}

console.log(`Loaded ${products.length} products, ${arTitles.size} AR titles`);

const log = [];
let totalFixed = 0;
let productsTouched = 0;

for (const p of products) {
  const ar = arTitles.get(p.id) || "";
  const kind = classify(p.handle);
  const images = p.media.edges
    .map((e) => e.node)
    .filter((n) => n && n.id && n.image)
    .filter((n) => !(n.alt || "").trim());
  if (!images.length) continue;

  const baseAlt = buildAlt(p.title, ar, kind);
  // Tag images by index for variation: 1 = main, 2 = back, 3 = detail, etc.
  const variants = ["", " back منظر خلفي", " detail تفاصيل", " styled لوك", " close-up مقرّب"];
  const files = images.map((img, idx) => ({
    id: img.id,
    alt: idx === 0 ? baseAlt : `${baseAlt}${variants[idx] || ` view ${idx}`}`,
  }));

  // Shopify allows up to 250 ids per call but we'll batch per product to keep
  // userErrors local.
  const d = await gql(
    `mutation($files:[FileUpdateInput!]!){
      fileUpdate(files:$files){
        files{ ... on MediaImage { id alt } }
        userErrors{ field message }
      }
    }`,
    { files },
  );
  const errs = d.fileUpdate.userErrors || [];
  if (errs.length) {
    console.log(`  ❌ ${p.handle}: ${JSON.stringify(errs)}`);
    log.push({ handle: p.handle, errors: errs });
  } else {
    totalFixed += files.length;
    productsTouched++;
    console.log(`  ✅ ${p.handle}: ${files.length} alt set`);
    log.push({ handle: p.handle, fixed: files.length });
  }
  await sleep(220);
}

console.log(`\n✅ Done. ${totalFixed} alt texts written across ${productsTouched} products.`);
writeFileSync(resolve(__dirname, "..", "fill-image-alt-text.log.json"), JSON.stringify(log, null, 2));
