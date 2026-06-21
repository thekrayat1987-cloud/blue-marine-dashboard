#!/usr/bin/env node
/**
 * For multi-color/mosaic/printed products, extract the top distinct colors
 * from the featured image via k-means clustering, map each to Shopify's color
 * palette, and set shopify.color-pattern as a list of unique metaobject GIDs.
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

function dist(a, b) { return (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2; }
function nearestColor(rgb) {
  let best = PALETTE[0], bestD = Infinity;
  for (const c of PALETTE) { const d = dist(rgb, c.rgb); if (d < bestD) { bestD = d; best = c; } }
  return best;
}

// Simple k-means clustering
function kmeans(points, k, iters = 20) {
  // init: pick k random points
  const centroids = [];
  const used = new Set();
  while (centroids.length < k) {
    const i = Math.floor(Math.random() * points.length);
    if (!used.has(i)) { used.add(i); centroids.push([...points[i]]); }
  }
  let assignments = new Array(points.length);
  for (let iter = 0; iter < iters; iter++) {
    // assign
    for (let i = 0; i < points.length; i++) {
      let best = 0, bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = dist(points[i], centroids[c]);
        if (d < bestD) { bestD = d; best = c; }
      }
      assignments[i] = best;
    }
    // update
    const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let i = 0; i < points.length; i++) {
      const c = assignments[i];
      sums[c][0] += points[i][0];
      sums[c][1] += points[i][1];
      sums[c][2] += points[i][2];
      sums[c][3]++;
    }
    for (let c = 0; c < k; c++) {
      if (sums[c][3] > 0) {
        centroids[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
      }
    }
  }
  // Compute cluster sizes
  const sizes = new Array(k).fill(0);
  for (const a of assignments) sizes[a]++;
  return centroids.map((c, i) => ({ rgb: c.map((n) => Math.round(n)), count: sizes[i] }));
}

const TARGETS = [
  "a123-zafira-mosaic-daraa",
  "a124-noor-printed-caftan",
  "a131-farah-patterned-daraa",
  "a136-mosaic-bisht-3-piece-set",
];

const data = await gql(`query { products(first: 250) { edges { node {
  id handle featuredImage { url }
} } } }`);
const productsByHandle = Object.fromEntries(
  data.products.edges.map((e) => [e.node.handle, e.node])
);

const results = [];
for (const handle of TARGETS) {
  const p = productsByHandle[handle];
  if (!p?.featuredImage?.url) { results.push({ handle, error: "no image" }); continue; }
  const imgRes = await fetch(p.featuredImage.url);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const meta = await sharp(buf).metadata();
  const w = meta.width || 864, h = meta.height || 1536;
  const left = Math.floor(w * 0.20);
  const top = Math.floor(h * 0.55);
  const cropW = Math.floor(w * 0.6);
  const cropH = Math.floor(h * 0.35);

  const raw = await sharp(buf)
    .extract({ left, top, width: cropW, height: cropH })
    .resize({ width: 120, fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Filter out skin / background pixels
  const pixels = [];
  for (let i = 0; i < raw.data.length; i += raw.info.channels) {
    const r = raw.data[i], g = raw.data[i + 1], b = raw.data[i + 2];
    const sum = r + g + b;
    if (sum > 680) continue;                    // background
    if (sum < 30) continue;                     // pure shadow
    const isSkin = r > 150 && r < 240 && g > r * 0.7 && g < r * 0.95 && b > r * 0.5 && b < r * 0.85 && r > g && g > b;
    if (isSkin) continue;
    pixels.push([r, g, b]);
  }

  if (pixels.length < 100) {
    results.push({ handle, error: "too few non-skin pixels" });
    continue;
  }

  // k-means with k=5 to find the 5 main color clusters
  const clusters = kmeans(pixels, 5, 25).sort((a, b) => b.count - a.count);

  // Map each cluster to nearest palette color, deduplicate by GID
  const ranked = clusters.map((c) => ({
    cluster_rgb: `rgb(${c.rgb.join(",")})`,
    count: c.count,
    match: nearestColor(c.rgb),
  }));

  // Keep top 3 unique palette colors that have at least 5% of pixels each
  const seen = new Set();
  const final = [];
  for (const r of ranked) {
    if (seen.has(r.match.gid)) continue;
    if (r.count < pixels.length * 0.05) continue; // ignore tiny outliers
    seen.add(r.match.gid);
    final.push(r);
    if (final.length >= 4) break;
  }

  results.push({
    handle,
    id: p.id,
    pixelCount: pixels.length,
    clusters: ranked,
    selected: final.map((r) => ({ name: r.match.name, rgb: r.cluster_rgb, gid: r.match.gid })),
    gids: final.map((r) => r.match.gid),
  });
}

console.log("\n=== Detected multi-color patterns ===");
for (const r of results) {
  if (r.error) { console.log(`${r.handle}: ERROR ${r.error}`); continue; }
  console.log(`\n${r.handle}:`);
  console.log(`  Selected colors: ${r.selected.map((s) => `${s.name} (${s.rgb})`).join(" + ")}`);
  console.log(`  All clusters (top 5):`);
  for (const c of r.clusters) console.log(`    ${c.cluster_rgb.padEnd(20)} count=${String(c.count).padStart(5)} → ${c.match.name}`);
}

writeFileSync(resolve(__dirname, "..", "detect-multicolor.log.json"), JSON.stringify(results, null, 2));

if (DRY_RUN) {
  console.log("\n[DRY RUN] No metafields set. Re-run without --dry-run to apply.");
  process.exit(0);
}

const MUT = `mutation($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) { metafields { id } userErrors { field message code } }
}`;
const inputs = results
  .filter((r) => !r.error && r.gids.length > 0)
  .map((r) => ({
    ownerId: r.id,
    namespace: "shopify",
    key: "color-pattern",
    type: "list.metaobject_reference",
    value: JSON.stringify(r.gids),
  }));
const res = await gql(MUT, { metafields: inputs });
console.log("\nApply:", JSON.stringify(res.metafieldsSet, null, 2));
