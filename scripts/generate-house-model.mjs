import { GoogleGenAI, Modality } from "@google/genai";
import fs from "node:fs";
import path from "node:path";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = "gemini-2.5-flash-image";

const SHARED = `Photograph of a single female fashion model — full-body editorial portrait — for the luxury Kuwaiti atelier "Blue Marine".

# MODEL IDENTITY (must be reproducible — photograph her like a real specific person)
- Pan-Arab Mediterranean woman, around 28-32 years old.
- Olive skin, warm undertone, flawless natural complexion (no heavy makeup).
- Long dark brown straight-to-softly-wavy hair, falling past the shoulders, well-groomed.
- Almond-shaped brown eyes, calm confident gaze.
- Refined harmonious features, soft and feminine, NOT sharp/edgy/runway-extreme.
- Body type characteristic of Khaleeji / Kuwaiti women: full natural bust, soft feminine curves, defined waist, not runway-thin. Mature womanly figure with presence — elegant and curvy, NOT skinny or bony.
- Tall stature, statuesque posture.
- Serene neutral expression, slight subtle smile, dignified — "lady of the house" energy, not "fashion week".

# OUTFIT
She wears a SIMPLE plain neutral outfit — ivory or warm beige fitted long dress or simple tunic, no patterns, no embroidery. The outfit should be neutral so she can later be re-dressed in any garment.

# SETTING
Smooth seamless studio backdrop, warm cream-to-beige gradient. Soft even studio lighting, gentle highlights on face and hair, no harsh shadows.

# OUTPUT FRAMING
Vertical 9:16 portrait, full-body, head visible at top with small headroom, feet visible above small floor margin. Centered horizontally.

# CRITICAL
- Single woman only, alone in frame.
- Photorealistic, high fashion editorial quality.
- No text, no logos, no watermarks.`;

const VARIANTS = [
  {
    name: "option-A-face-visible",
    extra: `# POSE — VARIANT A: FACE FULLY VISIBLE
Frontal pose, body facing camera straight on, head facing camera, both eyes visible, soft direct gaze toward the lens. Arms relaxed beside the body. Confident, calm, open expression.`,
  },
  {
    name: "option-B-three-quarter-turned",
    extra: `# POSE — VARIANT B: THREE-QUARTER / FACE PARTIALLY TURNED
Body turned ~30° from camera, head turned slightly further so the face is seen from a 3/4 angle (not full profile, not full front) — one cheek and the bridge of the nose more prominent, eyes looking softly off-camera or just past the lens. More mysterious, pudique, editorial. Arms relaxed, weight on back leg for elongated silhouette.`,
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

console.log("\nDone.");
