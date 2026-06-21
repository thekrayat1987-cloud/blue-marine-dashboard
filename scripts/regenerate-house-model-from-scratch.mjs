import { GoogleGenAI, Modality } from "@google/genai";
import fs from "node:fs";
import path from "node:path";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = "gemini-2.5-flash-image";

const SHARED = `Photorealistic full-body editorial portrait of a single female fashion model for the luxury Kuwaiti atelier "Blue Marine".

# FACE & HEAD — describe her like a real specific woman
- Pan-Arab Mediterranean / Levantine woman, around 30 years old.
- Olive skin with warm golden undertone, smooth flawless complexion, no heavy makeup, very subtle natural makeup (soft brown eyeliner, neutral lip).
- Long dark brown straight-to-softly-wavy hair, well-groomed, parted slightly off-center, falling well past the shoulders, smooth and shiny — NOT curly, NOT pulled back.
- Almond-shaped warm brown eyes, calm confident gaze, gentle natural eyebrows (full but softly groomed).
- Straight refined nose, soft defined cheekbones, full natural lips with a barely-there subtle smile.
- Soft oval face, harmonious feminine features — NOT sharp, NOT runway-edgy, NOT exotic-extreme. "Lady of the house" energy, dignified, warm.

# BODY — IMPORTANT, this is the whole point of this regeneration
She has a CURVY mature Khaleeji woman's figure — definitely NOT thin, NOT runway-skinny, NOT a teenage model. Healthy, full, womanly, confident.
- Full natural bust, soft and rounded.
- Defined but soft waist (not corseted, not flat).
- Wide rounded hips, full thighs visible through the dress.
- Softly fleshed arms and shoulders — no visible bones, no protruding clavicles, no sharp angles.
- Tall stature, statuesque posture, but visibly fuller and rounder than a runway model.
- Mature "umm al-bayt" presence — confident, fleshy in a healthy elegant way.

# OUTFIT
She wears a simple plain warm-beige fitted long-sleeve midi knit dress that hugs her curves, so the new fuller silhouette is clearly visible. Plain, no patterns, no embroidery. Neutral so she can later be re-dressed in any garment.

# POSE
Three-quarter turned pose (~30-40° from camera), body angled to show curves naturally, head softly turned toward the camera with calm direct gaze, weight on back leg for elongated posture, arms relaxed beside the body, one hand softly at the hip is OK.

# SETTING
Smooth seamless studio backdrop, warm cream-to-beige gradient. Soft even studio lighting, gentle highlights on face and hair, no harsh shadows.

# OUTPUT FRAMING
Vertical 9:16 portrait, full-body, head visible at top with small headroom, feet visible above small floor margin. Centered horizontally.

# CRITICAL
- Single woman only, alone in frame.
- Photorealistic, high fashion editorial quality.
- No text, no logos, no watermarks.
- DO NOT generate a thin model. Body MUST be visibly curvy and full.`;

const VARIANTS = [
  {
    name: "scratch-1-curvy-size40",
    extra: `# BODY SIZE TARGET — FRENCH SIZE 40 (curvy, healthy)
Hourglass figure, full C-cup bust, defined waist, rounded hips clearly wider than the bust, soft thighs. Visibly curvy, NOT thin.`,
  },
  {
    name: "scratch-2-fuller-size42",
    extra: `# BODY SIZE TARGET — FRENCH SIZE 42 (fuller, mature)
Generous D-cup bust, soft rounded waist with natural feminine softness, wide full hips, full thighs visible through the knit dress, fleshed-out arms. Mature lady-of-the-house silhouette.`,
  },
  {
    name: "scratch-3-generous-size44",
    extra: `# BODY SIZE TARGET — FRENCH SIZE 44 (generously curvy Khaleeji)
Voluptuous figure, full DD-cup bust, soft fleshy waist (modest natural belly visible through the knit), wide generous hips, full rounded thighs and calves, softly rounded shoulders and arms. Plump elegant Khaleeji "umm al-bayt" — confident, regal, generously feminine. Never cartoonish, always harmonious.`,
  },
];

const outDir = path.resolve(process.cwd(), "scripts", "house-model-previews");
fs.mkdirSync(outDir, { recursive: true });

for (const v of VARIANTS) {
  console.log(`Generating ${v.name}...`);
  const prompt = `${SHARED}\n\n${v.extra}`;
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { responseModalities: [Modality.IMAGE] },
  });
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData?.data);
  if (!img) {
    const txt = parts.find((p) => p.text)?.text ?? "no text";
    throw new Error(`No image for ${v.name}: ${txt}`);
  }
  const file = path.join(outDir, `${v.name}.png`);
  fs.writeFileSync(file, Buffer.from(img.inlineData.data, "base64"));
  console.log(`  → ${file}`);
}

console.log("\nDone. Previews in scripts/house-model-previews/");
