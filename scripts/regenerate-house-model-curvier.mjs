import { GoogleGenAI, Modality } from "@google/genai";
import fs from "node:fs";
import path from "node:path";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = "gemini-2.5-flash-image";

const currentModelPath = path.resolve(process.cwd(), "public", "house-model.png");
const currentModelBuf = fs.readFileSync(currentModelPath);
const currentModelB64 = currentModelBuf.toString("base64");

const SHARED = `# TASK — VERY IMPORTANT
The input image shows a woman whose BODY is too thin (anorexic-looking, runway-skinny). The studio that owns this brand has rejected her current body shape.

You must produce a NEW image of the SAME PERSON (same face, same hair, same skin) but with a CLEARLY DIFFERENT, FULLER body. The body in the new image MUST look noticeably different from the body in the input — fuller, more curves, more weight. If the new body looks the same as the input, you have FAILED the task.

# WHAT TO COPY FROM THE INPUT (face/hair/skin only — NOT the body)
- Face: same exact bone structure, same eyes (shape, color, spacing), same nose, same lips, same jawline, same eyebrows. Same person.
- Skin: same olive Mediterranean tone, same warm undertone.
- Hair: same length (past shoulders), same dark brown color, same straight-to-softly-wavy texture, same parting.
- Age: same apparent age (late 20s to early 30s).
- Expression: same calm confident gaze.

A viewer should look at both images and say "same woman, but the new one has a fuller / curvier body".

# WHAT TO IGNORE FROM THE INPUT (DO NOT COPY)
- Her body silhouette in the input is the WRONG body. Do NOT reproduce it.
- Do NOT reproduce her thin waist, narrow hips, flat chest or thin arms from the input. Replace ALL of that with the new body specified below.

# OUTFIT
Plain ivory / warm beige fitted long-sleeve midi dress, knit fabric that hugs the new body shape so the new fuller silhouette is clearly visible. No patterns, no embroidery. Neutral so she can later be re-dressed in any garment.

# POSE
Three-quarter turned pose (~30-40° from camera), head softly turned, weight on back leg, arms relaxed. Full-body framing.

# SETTING
Smooth seamless studio backdrop, warm cream-to-beige gradient. Soft even studio lighting, gentle highlights on face and hair, no harsh shadows.

# OUTPUT FRAMING
Vertical 9:16 portrait, full-body, head visible at top with small headroom, feet visible above small floor margin. Centered horizontally.

# CRITICAL
- Single woman only, alone in frame.
- Photorealistic, high fashion editorial quality.
- No text, no logos, no watermarks.
- Body MUST look visibly fuller than the input. Same face, different body.`;

const VARIANTS = [
  {
    name: "option-1-natural-curves",
    extra: `# BODY — VARIANT 1: NATURALLY CURVY (French size 40)
Replace the input's body with: HOURGLASS silhouette. Full natural C-cup bust (visibly fuller than input), defined waist (still noticeably narrower than hips), soft rounded hips wider than the bust line was in the input, smooth feminine arms with natural softness (no visible bones, no protruding clavicles, no thigh gap). Healthy mature figure — French size 40, "real woman" body. NOT plus-size, but UNDENIABLY curvier than the input.`,
  },
  {
    name: "option-2-fuller-figure",
    extra: `# BODY — VARIANT 2: FULLER FIGURE (French size 42)
Replace the input's body with: a CLEARLY FULLER, more womanly figure. Generous D-cup bust, soft rounded waist (defined but with natural softness, no visible ribs), wide rounded hips, full thighs visible through the dress, softly fleshed arms (no bones, no sharp angles). Confident "lady of the house" silhouette, French size 42. Visibly heavier and rounder than the input — the difference must be obvious at first glance.`,
  },
  {
    name: "option-3-generous-curves",
    extra: `# BODY — VARIANT 3: GENEROUS KHALEEJI CURVES (French size 44)
Replace the input's body with: GENEROUSLY CURVY mature Khaleeji figure. Full DD-cup bust, soft fleshy round waist (modest belly visible through the knit dress), wide generous hips, full rounded thighs and calves, fleshed-out softly rounded arms and shoulders. "Umm al-bayt" voluptuous presence — French size 44. The body must be UNAMBIGUOUSLY full and curvy — a mature plump lady, NOT a runway model. Elegant and harmonious, never cartoonish.`,
  },
];

const outDir = path.resolve(process.cwd(), "scripts", "house-model-previews");
fs.mkdirSync(outDir, { recursive: true });

for (const v of VARIANTS) {
  console.log(`Generating ${v.name}...`);
  const prompt = `${SHARED}\n\n${v.extra}`;
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType: "image/png", data: currentModelB64 } },
        ],
      },
    ],
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

console.log("\nDone. Previews saved in scripts/house-model-previews/");
console.log("Open them, pick your favourite, then we move it to public/house-model.png");
