#!/usr/bin/env node
// Build a visual verification page for the duplicates flagged by
// audit-duplicate-images.mjs. Adds exact-byte hash + dHash + size comparison
// so we can confirm true duplicates before any deletion.
//
// Output: scripts/duplicate-images-verify.html (open in browser).

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reportPath = path.resolve(__dirname, "duplicate-images-report.json");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));

async function dHash(buffer) {
  const raw = await sharp(buffer).grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let bits = "";
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits += raw[y * 9 + x] < raw[y * 9 + x + 1] ? "1" : "0";
    }
  }
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

function hamming(a, b) {
  if (!a || !b) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

async function imgInfo(url) {
  const r = await fetch(url);
  const buf = Buffer.from(await r.arrayBuffer());
  const sha = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 12);
  const meta = await sharp(buf).metadata();
  const dh = await dHash(buf);
  return { url, bytes: buf.length, sha, dh, w: meta.width, h: meta.height };
}

console.log(`Vérification de ${report.report.length} produits avec doublons signalés…`);

const sections = [];
for (const p of report.report) {
  const groups = [...(p.sameBaseName || []), ...(p.visuallyIdentical || [])];
  const groupHtml = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    const infos = await Promise.all(group.map((m) => imgInfo(m.url).then((i) => ({ ...i, mediaId: m.mediaId }))));
    // Pairwise comparison vs first image
    const ref = infos[0];
    const cells = infos.map((info, i) => {
      const sameBytes = i === 0 ? "—" : (info.sha === ref.sha ? "✅ identique" : "❌ différent");
      const ham = i === 0 ? "—" : hamming(ref.dh, info.dh);
      const verdict = i === 0 ? "RÉFÉRENCE" :
        (info.sha === ref.sha ? "DOUBLON EXACT" :
         ham <= 3 ? "TRÈS PROBABLE doublon" :
         ham <= 6 ? "probable doublon" :
         ham <= 10 ? "douteux" : "PAS un doublon");
      const color = i === 0 ? "#888" :
        info.sha === ref.sha ? "#0a7f00" :
        ham <= 3 ? "#0a7f00" :
        ham <= 6 ? "#c47b00" :
        ham <= 10 ? "#c47b00" : "#c00";
      return `
        <div class="card">
          <img src="${info.url}" loading="lazy" />
          <div class="meta">
            <div><b>${info.w}×${info.h}</b> · ${(info.bytes / 1024).toFixed(0)} KB</div>
            <div>sha: ${info.sha}</div>
            <div>vs ref: ${sameBytes} · hamming ${ham}</div>
            <div class="verdict" style="color:${color}"><b>${verdict}</b></div>
            <div class="mid">${info.mediaId.split("/").pop()}</div>
          </div>
        </div>`;
    }).join("");
    groupHtml.push(`<div class="group"><div class="ghdr">Groupe ${gi + 1} — ${infos.length} images</div><div class="row">${cells}</div></div>`);
  }
  sections.push(`
    <section>
      <h2>${p.sku} — ${p.title}</h2>
      <div class="handle">handle: ${p.handle} · ${p.totalImages} images au total</div>
      ${groupHtml.join("")}
    </section>`);
  console.log(`  ✓ ${p.sku}`);
}

const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Vérification doublons</title>
<style>
  body { font: 14px/1.4 -apple-system, sans-serif; max-width: 1400px; margin: 24px auto; padding: 0 16px; color: #222; background: #fafaf7; }
  h1 { font-size: 22px; }
  section { background: #fff; padding: 16px; margin: 24px 0; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  h2 { margin: 0 0 4px; font-size: 18px; }
  .handle { color: #777; font-size: 12px; margin-bottom: 12px; }
  .group { border-top: 1px solid #eee; padding-top: 12px; margin-top: 12px; }
  .ghdr { font-size: 12px; color: #555; margin-bottom: 8px; }
  .row { display: flex; gap: 12px; flex-wrap: wrap; }
  .card { width: 220px; background: #f5f5f0; border-radius: 6px; overflow: hidden; }
  .card img { width: 100%; height: 280px; object-fit: cover; display: block; background: #ddd; }
  .meta { padding: 8px; font-size: 11px; color: #444; }
  .verdict { margin-top: 6px; font-size: 12px; }
  .mid { color: #999; font-size: 10px; margin-top: 4px; word-break: break-all; }
  .legend { background: #fff; padding: 12px 16px; border-radius: 6px; font-size: 13px; }
</style></head><body>
<h1>Vérification visuelle des doublons (${report.report.length} produits)</h1>
<div class="legend">
  <b>Verdict basé sur :</b>
  ✅ <b>DOUBLON EXACT</b> = même fichier (sha256) — supprimable sans risque<br>
  🟠 <b>TRÈS PROBABLE / probable</b> = même image, ré-encodée ou re-cropée (hamming ≤6) — à valider visuellement<br>
  🟠 <b>douteux</b> = images similaires mais peut-être 2 prises différentes (hamming 7-10)<br>
  ❌ <b>PAS un doublon</b> = images vraiment distinctes
</div>
${sections.join("")}
</body></html>`;

const outHtml = path.resolve(__dirname, "duplicate-images-verify.html");
fs.writeFileSync(outHtml, html);
console.log(`\n✅ Page de vérification: ${outHtml}`);
console.log(`   Ouvre-la dans Chrome pour valider visuellement.`);
