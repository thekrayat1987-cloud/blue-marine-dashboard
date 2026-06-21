#!/usr/bin/env node
/**
 * For each product missing shopify.color-pattern, download the featured image,
 * extract the dominant garment color (cropping the center to avoid background/skin),
 * map it to the nearest Shopify color metaobject, then set the metafield.
 *
 * Outputs a JSON log + prompts to ALL 32 products with detected color.
 * Use --dry-run to preview without writing.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const URL_ = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${process.env.SHOPIFY_API_VERSION || "2024-10"}/graphql.json`;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const DRY_RUN = process.argv.includes("--dry-run");

async function gql(q, v = {}) {
  const r = await fetch(URL_, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN }, body: JSON.stringify({ query: q, variables: v }) });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

// Shopify standard color palette with their metaobject GIDs and RGB values.
// GIDs taken from the COLOR_MAP in src/lib/shopify.ts.
const PALETTE = [
  { name: "Pink",      rgb: [240, 165, 180], gid: "gid://shopify/Metaobject/176780116268" },
  { name: "Yellow",    rgb: [240, 200, 80],  gid: "gid://shopify/Metaobject/174696300844" },
  { name: "Grey",      rgb: [128, 128, 128], gid: "gid://shopify/Metaobject/169946775852" },
  { name: "Black",     rgb: [25, 25, 25],    gid: "gid://shopify/Metaobject/169808855340" },
  { name: "White",     rgb: [245, 245, 245], gid: "gid://shopify/Metaobject/174967226668" },
  { name: "Blue",      rgb: [50, 100, 190],  gid: "gid://shopify/Metaobject/171100864812" },
  { name: "Navy",      rgb: [25, 35, 80],    gid: "gid://shopify/Metaobject/185972785452" },
  { name: "Green",     rgb: [50, 130, 70],   gid: "gid://shopify/Metaobject/169844736300" },
  { name: "Red",       rgb: [180, 30, 40],   gid: "gid://shopify/Metaobject/169927180588" },
  { name: "Olive",     rgb: [110, 110, 50],  gid: "gid://shopify/Metaobject/184192794924" },
  { name: "Burgundy",  rgb: [115, 35, 50],   gid: "gid://shopify/Metaobject/170104586540" },
  { name: "Ivory",     rgb: [240, 230, 210], gid: "gid://shopify/Metaobject/184192958764" },
  { name: "Beige",     rgb: [210, 190, 160], gid: "gid://shopify/Metaobject/170956882220" },
  { name: "Brown",     rgb: [110, 70, 40],   gid: "gid://shopify/Metaobject/171073175852" },
  { name: "Gold",      rgb: [185, 145, 60],  gid: "gid://shopify/Metaobject/170103734572" },
  { name: "Purple",    rgb: [110, 60, 130],  gid: "gid://shopify/Metaobject/169943793964" },
  { name: "Orange",    rgb: [220, 120, 50],  gid: "gid://shopify/Metaobject/170951311660" },
  { name: "Mustard",   rgb: [200, 150, 40],  gid: "gid://shopify/Metaobject/195137863980" },
  { name: "Emerald",   rgb: [60, 130, 100],  gid: "gid://shopify/Metaobject/195137831212" },
  { name: "Bronze",    rgb: [150, 100, 60],  gid: "gid://shopify/Metaobject/184191582508" },
  { name: "Plum",      rgb: [110, 75, 95],   gid: "gid://shopify/Metaobject/184192925996" },
];

function dist(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function nearestColor(rgb) {
  let best = PALETTE[0], bestD = Infinity;
  for (const c of PALETTE) {
    const d = dist(rgb, c.rgb);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

// Fetch products missing color-pattern (excluding the perfume / non-apparel)
const data = await gql(`query {
  products(first: 250) {
    edges { node {
      id handle title productType
      featuredImage { url }
      color: metafield(namespace:"shopify", key:"color-pattern") { value }
    } }
  }
}`);

const targets = data.products.edges
  .map((e) => e.node)
  .filter((p) => (!p.color?.value || p.color.value === "[]") && p.productType !== "Fragrance" && p.featuredImage?.url);

console.log(`Processing ${targets.length} products missing color-pattern...\n`);

const results = [];
for (const p of targets) {
  try {
    const imgRes = await fetch(p.featuredImage.url);
    const buf = Buffer.from(await imgRes.arrayBuffer());

    // Crop the BOTTOM band of the dress — for a floor-length daraa with a 3/4
    // turned mannequin, the lower portion is overwhelmingly fabric (no skin/face).
    // Then quantize to a small palette via k-means in sharp and pick dominant.
    const meta = await sharp(buf).metadata();
    const w = meta.width || 864;
    const h = meta.height || 1536;
    const left = Math.floor(w * 0.20);
    const top = Math.floor(h * 0.62);      // below the waist
    const cropW = Math.floor(w * 0.6);
    const cropH = Math.floor(h * 0.28);    // through the hem of the dress

    // Raw pixel sampling: get all pixels in the crop, filter background + skin tones,
    // then take the median of the remaining for robustness.
    const raw = await sharp(buf)
      .extract({ left, top, width: cropW, height: cropH })
      .resize({ width: 80, fit: "inside" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixels = raw.data;
    const channels = raw.info.channels;

    const reds = [], greens = [], blues = [];
    for (let i = 0; i < pixels.length; i += channels) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      const sum = r + g + b;
      // Skip near-white (background)
      if (sum > 680) continue;
      // Skip near-black floor shadow if extreme low (keep dark fabrics by allowing >18 per channel)
      if (sum < 30) continue;
      // Skip skin-tone-like beige (R > G > B with classic warm ratio)
      const isSkin = r > 150 && r < 240 && g > r * 0.7 && g < r * 0.95 && b > r * 0.5 && b < r * 0.85 && r > g && g > b;
      if (isSkin) continue;
      reds.push(r); greens.push(g); blues.push(b);
    }

    let rgb;
    if (reds.length < 50) {
      // Fallback: not enough non-skin pixels, just use raw dominant
      const { dominant } = await sharp(buf).extract({ left, top, width: cropW, height: cropH }).stats();
      rgb = [dominant.r, dominant.g, dominant.b];
    } else {
      // Median is robust to outliers
      reds.sort((a, b) => a - b);
      greens.sort((a, b) => a - b);
      blues.sort((a, b) => a - b);
      const mid = Math.floor(reds.length / 2);
      rgb = [reds[mid], greens[mid], blues[mid]];
    }
    const match = nearestColor(rgb);

    results.push({
      handle: p.handle,
      title: p.title,
      rgb: `rgb(${rgb.join(",")})`,
      detected: match.name,
      gid: match.gid,
      id: p.id,
    });
    process.stderr.write(`✓ ${p.handle.padEnd(40)} rgb(${rgb.map((n)=>String(n).padStart(3)).join(",")}) → ${match.name}\n`);
  } catch (err) {
    results.push({ handle: p.handle, error: err.message });
    process.stderr.write(`✗ ${p.handle}: ${err.message}\n`);
  }
}

writeFileSync(resolve(__dirname, "..", "detect-color-pattern.log.json"), JSON.stringify(results, null, 2));
console.log("\n=== Detected colors ===");
console.table(results.filter((r) => !r.error).map((r) => ({ handle: r.handle, detected: r.detected, rgb: r.rgb })));

if (DRY_RUN) {
  console.log("\n[DRY RUN] No metafields were set. Review the table above, then re-run without --dry-run.");
  process.exit(0);
}

// Apply: set shopify.color-pattern metafield as list of metaobject_reference
const MUT = `mutation($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { id namespace key value }
    userErrors { field message code }
  }
}`;
// Manual overrides confirmed by Khadija
const BLUE_GID = PALETTE.find((c) => c.name === "Blue").gid;
const BEIGE_GID = PALETTE.find((c) => c.name === "Beige").gid;
const OVERRIDES = {
  "a143-loulwa-daraa-set": [BLUE_GID, BEIGE_GID],
};

const inputs = results
  .filter((r) => !r.error)
  .map((r) => ({
    ownerId: r.id,
    namespace: "shopify",
    key: "color-pattern",
    type: "list.metaobject_reference",
    value: JSON.stringify(OVERRIDES[r.handle] ?? [r.gid]),
  }));

// Batches of 25
const log = [];
for (let i = 0; i < inputs.length; i += 25) {
  const batch = inputs.slice(i, i + 25);
  const res = await gql(MUT, { metafields: batch });
  if (res.metafieldsSet.userErrors.length) log.push({ batch: i / 25, errors: res.metafieldsSet.userErrors });
  else log.push({ batch: i / 25, count: res.metafieldsSet.metafields.length });
  process.stderr.write(`batch ${i / 25 + 1}: ${res.metafieldsSet.metafields.length} updated\n`);
}
writeFileSync(resolve(__dirname, "..", "detect-color-pattern.apply.log.json"), JSON.stringify({ results, log }, null, 2));
console.log("\n✅ Done. Set color-pattern on " + inputs.length + " products.");
