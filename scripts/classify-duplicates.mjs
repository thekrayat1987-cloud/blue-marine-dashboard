#!/usr/bin/env node
// Classify the flagged duplicates by certainty:
//   A. EXACT — sha256 match → 100% sure, safe to auto-delete
//   B. NEAR  — hamming ≤ 3 → same source image, re-cropped or re-encoded
//   C. SIMILAR — hamming 4-6 → likely same, needs eye
//   D. DOUBTFUL — hamming 7-10 → probably different photos of same outfit

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const report = JSON.parse(fs.readFileSync(path.resolve(__dirname, "duplicate-images-report.json"), "utf8"));

async function dHash(buffer) {
  const raw = await sharp(buffer).grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let bits = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += raw[y * 9 + x] < raw[y * 9 + x + 1] ? "1" : "0";
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}
function hamming(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { d += x & 1; x >>= 1; } }
  return d;
}
async function imgInfo(url) {
  const r = await fetch(url);
  const buf = Buffer.from(await r.arrayBuffer());
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  const meta = await sharp(buf).metadata();
  return { url, bytes: buf.length, sha, dh: await dHash(buf), w: meta.width, h: meta.height };
}

const out = [];
for (const p of report.report) {
  const groups = [...(p.sameBaseName || []), ...(p.visuallyIdentical || [])];
  for (let gi = 0; gi < groups.length; gi++) {
    const infos = await Promise.all(groups[gi].map((m) => imgInfo(m.url).then((i) => ({ ...i, mediaId: m.mediaId }))));
    const ref = infos[0];
    for (let i = 1; i < infos.length; i++) {
      const it = infos[i];
      const sameBytes = it.sha === ref.sha;
      const h = hamming(ref.dh, it.dh);
      const category = sameBytes ? "A_EXACT" : h <= 3 ? "B_NEAR" : h <= 6 ? "C_SIMILAR" : "D_DOUBTFUL";
      out.push({
        sku: p.sku, handle: p.handle, title: p.title,
        category, hamming: h, sameBytes,
        keep: { mediaId: ref.mediaId, dim: `${ref.w}x${ref.h}`, kb: Math.round(ref.bytes / 1024) },
        candidate: { mediaId: it.mediaId, dim: `${it.w}x${it.h}`, kb: Math.round(it.bytes / 1024) },
      });
    }
  }
}

const byCat = { A_EXACT: [], B_NEAR: [], C_SIMILAR: [], D_DOUBTFUL: [] };
for (const x of out) byCat[x.category].push(x);

console.log("\n=== Classification finale ===\n");
for (const [cat, label] of [
  ["A_EXACT", "A — DOUBLON EXACT (sha256 identique, 100% sûr)"],
  ["B_NEAR", "B — TRÈS PROCHE (même source, re-crop/re-encode, hamming ≤3)"],
  ["C_SIMILAR", "C — SIMILAIRE (hamming 4-6, probable doublon — à valider visuellement)"],
  ["D_DOUBTFUL", "D — DOUTEUX (hamming 7-10, peut-être 2 prises différentes)"],
]) {
  console.log(`\n${label}: ${byCat[cat].length} paire(s)`);
  for (const x of byCat[cat]) {
    console.log(`  ${x.sku.padEnd(28)} keep ${x.keep.dim} (${x.keep.kb}KB)  ↔ remove ${x.candidate.dim} (${x.candidate.kb}KB)  ham=${x.hamming}`);
  }
}

fs.writeFileSync(path.resolve(__dirname, "duplicate-images-classified.json"), JSON.stringify({ generatedAt: new Date().toISOString(), pairs: out, byCategoryCount: Object.fromEntries(Object.entries(byCat).map(([k, v]) => [k, v.length])) }, null, 2));
console.log(`\n✅ Détail: scripts/duplicate-images-classified.json`);
