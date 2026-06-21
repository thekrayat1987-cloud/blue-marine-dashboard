#!/usr/bin/env node
import { GoogleGenAI, Modality } from "@google/genai";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envText = fs.readFileSync(path.resolve(__dirname, "..", ".env.local"), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = "gemini-2.5-flash-image";

const PROMPT = `# TASK
Create a luxury fashion editorial cover image for a Khaleeji summer-resort capsule called "AlKhairan" (named after the Kuwaiti coastal resort area). This image will be a Shopify collection cover.

# SUBJECT
A single elegant Gulf woman, late 20s, olive Mediterranean skin tone, dark hair, calm confident gaze. She wears a flowing lightweight two-piece daraa set in a soft pastel tone (soft coral / pale gold / sage / silver). The fabric is breezy, semi-sheer chiffon, catching light, gently moving in a coastal breeze.

# SETTING
Outdoor coastal scene at Al Khairan, Kuwait — Gulf coast luxury resort vibe. Calm turquoise sea in background, pale sand, soft warm late-afternoon light (golden hour). Architecture if visible: minimal modern white Mediterranean-style coastal pavilion or low white wall. No people in the background.

# MOOD
Quiet luxury, breezy, summer travel, Khaleeji elegance. Editorial fashion photography, not lifestyle snapshot. High-end lookbook quality.

# COMPOSITION
Vertical 9:16 portrait. Full-body or three-quarter framing. Subject centered or slightly off-center with negative space showing sea/sky. Soft natural light from the side. Shallow depth of field with gently blurred coastal background.

# STYLE
Photorealistic, fashion editorial, soft pastel palette, warm tones. Color grading: warm cream, soft gold, hints of sea blue. No oversaturation. Cinematic.

# CRITICAL
- Single woman only, alone in frame.
- No text, no logos, no watermarks, no captions.
- Dignified Khaleeji styling — modest, fully covered, elegant.
- Do NOT include the word "abaya" styling — this is a flowing daraa/caftan set.
- Vertical 9:16 aspect ratio.`;

const outDir = path.resolve(__dirname, "alkhairan-cover");
fs.mkdirSync(outDir, { recursive: true });

console.log("Generating AlKhairan cover via Gemini...");

const res = await ai.models.generateContent({
  model: MODEL,
  contents: [{ role: "user", parts: [{ text: PROMPT }] }],
  config: { responseModalities: [Modality.IMAGE] },
});

const parts = res.candidates?.[0]?.content?.parts ?? [];
const img = parts.find((p) => p.inlineData?.data);
if (!img) {
  const txt = parts.find((p) => p.text)?.text ?? "no text";
  throw new Error(`No image returned: ${txt}`);
}

const rawFile = path.join(outDir, "alkhairan-raw.png");
fs.writeFileSync(rawFile, Buffer.from(img.inlineData.data, "base64"));
console.log(`  → raw: ${rawFile}`);

// Standardize to 864x1536 RGB JPEG (matches all other collection covers on the store)
const finalFile = path.join(outDir, "alkhairan-cover.jpg");
await sharp(rawFile)
  .resize(864, 1536, { fit: "cover", position: "centre" })
  .flatten({ background: { r: 255, g: 255, b: 255 } })
  .jpeg({ quality: 92, mozjpeg: true })
  .toFile(finalFile);

const stat = fs.statSync(finalFile);
const meta = await sharp(finalFile).metadata();
console.log(`  → final: ${finalFile}`);
console.log(`     ${meta.width}x${meta.height}, ${meta.format}, ${(stat.size / 1024).toFixed(1)} KB`);
