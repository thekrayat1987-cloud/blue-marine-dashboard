#!/usr/bin/env node
/**
 * READ-ONLY: For every bisht-set featured image, ask Claude vision to
 * extract the dominant color(s), then cross-check against the existing
 * color-like tags. Outputs a mismatch report — no Shopify writes.
 */
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing in dashboard/.env.local");

const inspectionPath = resolve(__dirname, "..", "bisht-color-sources.json");
const inspection = JSON.parse(readFileSync(inspectionPath, "utf8"));
const rows = inspection.rows;
console.error(`Auditing ${rows.length} bisht products`);

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYS = `Tu es un expert couture qui identifie la couleur dominante d'une pièce de vêtement à partir d'une photo.

Pour CHAQUE image fournie, identifie:
1. La couleur principale du daraa intérieur (la robe sous le bisht/châle)
2. La couleur principale du bisht/châle extérieur (s'il y en a un visible)
3. Les couleurs des broderies / fils décoratifs (or, argent, etc.)

Règles strictes:
- Utilise UNIQUEMENT des noms de couleur simples en anglais minuscule, séparés par espaces si composés: "black", "ivory", "olive green", "burgundy", "navy", "emerald green", "dusty pink", "champagne gold", "mustard", "olive gold", "charcoal", "royal blue", "rose gold", "bronze"
- Si le tissu est noir mais brodé d'or, la couleur principale est "black" — l'or va dans embroidery
- Distingue olive green (vert kaki/militaire) de noir
- Distingue navy de noir
- Distingue ivory/cream de white pur

Réponds en JSON STRICT:
{
  "inner_daraa_color": "...",
  "outer_bisht_color": "..." | null,
  "embroidery_colors": ["..."],
  "dominant_overall": "...",
  "confidence": "high" | "medium" | "low",
  "notes": "..."
}`;

async function fetchImageBase64(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  // Detect MIME from magic bytes (Shopify CDN sometimes serves png under .jpg)
  let mime = "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) mime = "image/png";
  else if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) mime = "image/webp";
  return { base64: buf.toString("base64"), mime };
}

const results = [];
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  process.stderr.write(`[${i + 1}/${rows.length}] ${r.handle} ... `);
  if (!r.featured_image_url) {
    results.push({ handle: r.handle, error: "no featured image" });
    process.stderr.write("SKIP (no image)\n");
    continue;
  }
  try {
    const { base64, mime } = await fetchImageBase64(r.featured_image_url);
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      system: SYS,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mime, data: base64 } },
            { type: "text", text: `Identifie les couleurs de cette pièce. Handle: ${r.handle}. Titre: ${r.title}.` },
          ],
        },
      ],
    });
    const text = msg.content.find((b) => b.type === "text")?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    results.push({
      handle: r.handle,
      title: r.title,
      tags_color_like: r.tags_color_like,
      featured_image_url: r.featured_image_url,
      vision: parsed,
      raw_response_snippet: parsed ? null : text.slice(0, 300),
    });
    process.stderr.write(`${parsed?.dominant_overall || "PARSE_ERROR"}\n`);
  } catch (e) {
    results.push({ handle: r.handle, error: String(e.message || e) });
    process.stderr.write(`ERROR: ${e.message}\n`);
  }
}

// Build mismatch list: vision color not represented in tags
function tagSet(tags) {
  return new Set(tags.map((t) => t.toLowerCase().replace(/-/g, " ")));
}
function colorTokens(name) {
  if (!name) return [];
  return name.toLowerCase().split(/\s+/);
}
function tagsCoverColor(tags, colorName) {
  const tset = tagSet(tags);
  const tokens = colorTokens(colorName);
  // A "match" means at least one significant token from the vision color appears in tags.
  // Skip generic modifiers.
  const generic = new Set(["light", "dark", "deep", "soft", "muted", "bright", "warm", "cool"]);
  const meaningful = tokens.filter((t) => !generic.has(t));
  if (meaningful.length === 0) return false;
  return meaningful.some((t) => [...tset].some((tag) => tag.includes(t) || t.includes(tag)));
}

const mismatches = [];
const matches = [];
for (const r of results) {
  if (!r.vision) continue;
  const vis = r.vision.dominant_overall || r.vision.inner_daraa_color;
  const covered = tagsCoverColor(r.tags_color_like, vis);
  if (!covered) {
    mismatches.push({
      handle: r.handle,
      title: r.title,
      tags: r.tags_color_like,
      vision_dominant: vis,
      vision_inner: r.vision.inner_daraa_color,
      vision_outer: r.vision.outer_bisht_color,
      vision_embroidery: r.vision.embroidery_colors,
      vision_confidence: r.vision.confidence,
      vision_notes: r.vision.notes,
      featured_image_url: r.featured_image_url,
    });
  } else {
    matches.push({ handle: r.handle, tags: r.tags_color_like, vision_dominant: vis });
  }
}

const report = {
  generated_at: new Date().toISOString(),
  model: "claude-sonnet-4-6",
  total_products: results.length,
  matches: matches.length,
  mismatches: mismatches.length,
  errors: results.filter((r) => r.error).length,
  mismatch_details: mismatches,
  match_summary: matches,
  errors_list: results.filter((r) => r.error).map((r) => ({ handle: r.handle, error: r.error })),
};

writeFileSync(resolve(__dirname, "..", "bisht-vision-color-audit.json"), JSON.stringify(report, null, 2));
console.log(`\nDone. ${matches.length} match, ${mismatches.length} mismatch, ${report.errors} errors.`);
console.log(`Report: dashboard/bisht-vision-color-audit.json`);
