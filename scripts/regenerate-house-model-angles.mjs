import { GoogleGenAI, Modality } from "@google/genai";
import fs from "node:fs";
import path from "node:path";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = "gemini-2.5-flash-image";

const frontPath = path.resolve(process.cwd(), "public", "house-model-front.png");
const frontB64 = fs.readFileSync(frontPath).toString("base64");

const SHARED = `# TASK
The input image shows the Atelier Blue Marine house model standing front-facing. Produce a NEW image of the EXACT SAME WOMAN, in a different pose/angle as specified below.

# WHAT MUST STAY ABSOLUTELY IDENTICAL
- Face: same exact bone structure, same eyes (shape, color, spacing), same nose, same lips, same jawline, same eyebrows. Same person, recognizable instantly.
- Skin: same olive Mediterranean tone, same warm undertone.
- Hair: same length (past shoulders), same dark brown color, same straight-to-softly-wavy texture, same parting.
- Body: same fuller curvy silhouette, same proportions, same height, same weight. Do NOT slim her down.
- Outfit: same plain ivory / warm beige fitted long-sleeve midi knit dress.
- Background: same smooth seamless studio backdrop, same warm cream-to-beige gradient, same soft even lighting.
- Age: same apparent age (late 20s to early 30s).
- Expression: same calm confident gaze.

# CRITICAL
- This must be UNMISTAKABLY the same woman as the input — face recognition must match.
- Do NOT change the body. Do NOT change the dress. Do NOT change the background.
- Single woman only, alone in frame.
- Photorealistic, high fashion editorial quality.
- No text, no logos, no watermarks.
- Vertical 9:16 portrait.`;

const VARIANTS = [
  {
    name: "house-model-profile-left",
    extra: `# POSE — PURE LEFT PROFILE (90 degrees)
The model is rotated 90 degrees to her right so the camera sees her LEFT SIDE in pure profile. Shoulders perpendicular to camera, head looking straight ahead (NOT at camera). Arms relaxed at sides. Full-body framing, head visible top, feet visible bottom, centered horizontally.`,
  },
  {
    name: "house-model-back",
    extra: `# POSE — FULL BACK VIEW
The model is rotated 180 degrees so the camera sees her BACK. Shoulders square, head facing forward (away from camera) — slight glance over shoulder is acceptable but not required. Arms relaxed at sides. The hair flowing down her back must be clearly visible. Full-body framing, head visible top, feet visible bottom, centered horizontally.`,
  },
  {
    name: "house-model-three-quarter-left",
    extra: `# POSE — THREE-QUARTER LEFT TURN
The model is turned approximately 30-40 degrees to her LEFT (camera sees more of her right side). Head softly turned toward camera, weight on back leg, arms relaxed. Mirror of a typical 3/4 right pose. Full-body framing, head visible top, feet visible bottom, centered horizontally.`,
  },
  {
    name: "house-model-portrait-closeup",
    extra: `# POSE — CLOSE-UP PORTRAIT (bust shot)
Tight framing on head and shoulders only. Front-facing, head straight at camera, calm confident gaze. The dress is barely visible — focus is entirely on face, hair, neck, and shoulders. Sharp focus on eyes, soft natural studio light flattering the face. The crop starts at mid-chest and ends just above the head with small headroom. Vertical 9:16.`,
  },
];

const outDir = path.resolve(process.cwd(), "scripts", "house-model-previews");
fs.mkdirSync(outDir, { recursive: true });

async function generateOne(v, attempt = 1) {
  const prompt = `${SHARED}\n\n${v.extra}`;
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType: "image/png", data: frontB64 } },
        ],
      },
    ],
    config: { responseModalities: [Modality.IMAGE] },
  });
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData?.data);
  if (!img) {
    if (attempt < 3) {
      console.log(`  retry ${attempt + 1}/3 for ${v.name}...`);
      return generateOne(v, attempt + 1);
    }
    return null;
  }
  return Buffer.from(img.inlineData.data, "base64");
}

const results = [];
for (const v of VARIANTS) {
  console.log(`Generating ${v.name}...`);
  try {
    const buf = await generateOne(v);
    if (buf) {
      const file = path.join(outDir, `${v.name}.png`);
      fs.writeFileSync(file, buf);
      console.log(`  ✓ ${file}`);
      results.push({ name: v.name, ok: true });
    } else {
      console.log(`  ✗ ${v.name} — gave up after 3 attempts`);
      results.push({ name: v.name, ok: false });
    }
  } catch (err) {
    console.log(`  ✗ ${v.name} — error: ${err.message}`);
    results.push({ name: v.name, ok: false });
  }
}

console.log("\nResults:");
for (const r of results) console.log(`  ${r.ok ? "✓" : "✗"} ${r.name}`);
