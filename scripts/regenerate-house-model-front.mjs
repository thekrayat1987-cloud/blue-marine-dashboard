import { GoogleGenAI, Modality } from "@google/genai";
import fs from "node:fs";
import path from "node:path";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = "gemini-2.5-flash-image";

const currentModelPath = path.resolve(process.cwd(), "public", "house-model.png");
const currentModelBuf = fs.readFileSync(currentModelPath);
const currentModelB64 = currentModelBuf.toString("base64");

const PROMPT = `# TASK
The input image shows the Atelier Blue Marine house model in a 3/4 turned pose. Produce a NEW image of the EXACT SAME WOMAN, but rotated to face the camera fully (front-facing, 0 degrees from camera).

# WHAT MUST STAY IDENTICAL
- Face: same exact bone structure, same eyes (shape, color, spacing), same nose, same lips, same jawline, same eyebrows. Same person, recognizable instantly.
- Skin: same olive Mediterranean tone, same warm undertone.
- Hair: same length (past shoulders), same dark brown color, same straight-to-softly-wavy texture, same parting.
- Body: same fuller curvy silhouette, same proportions, same height, same weight. Do NOT slim her down.
- Outfit: same plain ivory / warm beige fitted long-sleeve midi knit dress.
- Background: same smooth seamless studio backdrop, same warm cream-to-beige gradient, same soft even lighting.
- Age: same apparent age (late 20s to early 30s).
- Expression: same calm confident gaze.

# THE ONLY CHANGE: POSE
- New pose: FULLY FRONT-FACING (0 degrees from camera, shoulders square to camera, hips square to camera).
- Head: looking straight at the camera, slight natural tilt allowed.
- Arms: relaxed at the sides, hands visible, no awkward overlap with the body silhouette.
- Stance: weight evenly balanced on both feet, slightly apart, stable confident posture.
- Full-body framing: head visible at top with small headroom, feet visible above small floor margin, centered horizontally.

# OUTPUT FRAMING
Vertical 9:16 portrait, full-body, photorealistic, high fashion editorial quality.

# CRITICAL
- This must be UNMISTAKABLY the same woman as the input — face recognition must match.
- Do NOT change the body. Do NOT change the dress. Do NOT change the background.
- Only the rotation/pose changes (3/4 → full front).
- Single woman only, alone in frame.
- No text, no logos, no watermarks.`;

const outDir = path.resolve(process.cwd(), "scripts", "house-model-previews");
fs.mkdirSync(outDir, { recursive: true });

console.log("Generating front-facing house model...");

const res = await ai.models.generateContent({
  model: MODEL,
  contents: [
    {
      role: "user",
      parts: [
        { text: PROMPT },
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
  throw new Error(`No image returned: ${txt}`);
}

const previewFile = path.join(outDir, "house-model-front.png");
fs.writeFileSync(previewFile, Buffer.from(img.inlineData.data, "base64"));
console.log(`  → ${previewFile}`);
console.log("\nDone. Open the preview, and if approved we copy it to public/house-model-front.png");
