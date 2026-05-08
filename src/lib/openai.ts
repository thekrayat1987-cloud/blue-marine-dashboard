import OpenAI, { toFile } from "openai";
import fs from "node:fs";
import path from "node:path";
import type { StylePreset, PosePreset } from "./gemini";

const IMAGE_MODEL = "gpt-image-1";

let cachedHouseModel: { data: Buffer; mimeType: string } | null | undefined;

function getHouseModel(): { data: Buffer; mimeType: string } | null {
  if (cachedHouseModel !== undefined) return cachedHouseModel;
  try {
    const file = path.join(process.cwd(), "public", "house-model.png");
    cachedHouseModel = { data: fs.readFileSync(file), mimeType: "image/png" };
  } catch {
    cachedHouseModel = null;
  }
  return cachedHouseModel;
}

const STYLE_PROMPTS: Record<StylePreset, string> = {
  studio:
    "Luxury studio backdrop with a subtle warm cream-to-beige gradient. Soft, even studio lighting with gentle highlights on the fabric to reveal embroidery and texture. No harsh shadows. Refined minimalist luxury.",
  lookbook:
    "Minimalist architectural interior with arches, warm marble and sandstone textures, subtle Moorish details. Golden-hour natural light filtering in. Timeless, modern oriental elegance.",
  lifestyle:
    "Serene Mediterranean / oriental setting — white-washed walls, lush greenery, soft sunlight, or terrace with sea view. Golden hour, warm and luminous, soft natural shadows. Aspirational refined luxury.",
  riad:
    "Interior courtyard of a traditional Moroccan riad — zellige tile mosaics, central marble fountain, carved cedar arches, hanging brass lanterns, terracotta plants. Soft diffused daylight from above with gentle dappled shadows.",
  palais:
    "Grand palace interior — marble floor, gilded mouldings, crystal chandelier, ornate mirrors, velvet drapes. Warm chandelier glow with soft highlights and subtle ambient shadows. Opulent ceremonial evening mood.",
  desert:
    "Vast golden sand dunes at golden hour, soft wind ripples, distant horizon, no harsh sun. Warm low-angle golden-hour light raking across the dunes with long soft shadows. Timeless, serene, cinematic.",
};

const POSE_PROMPTS: Record<PosePreset, string> = {
  front:
    "Tall elegant female model in a perfect frontal pose facing the camera, statuesque posture, arms relaxed beside the body, neutral confident expression. Full-body framing, centered composition.",
  three_quarter:
    "Tall elegant female model in a refined three-quarter angle (body turned ~30-40° from camera), one foot slightly forward, weight on the back leg for an elongated silhouette, hand resting gently at the waist or letting fabric fall, soft confident gaze toward the camera. Full-body framing.",
  profile:
    "Tall elegant female model in a clean side profile (90°), chin slightly lifted, arms relaxed, statuesque posture to showcase the garment's silhouette and side embroidery. Full-body framing.",
  back:
    "Tall elegant female model photographed from behind, head turned slightly to reveal the jawline, showcasing the back of the garment (neckline, embroidery, drape). Full-body framing.",
  walking:
    "Tall elegant female model captured mid-walk with natural movement, fabric flowing softly, one foot forward, slight side angle, candid look off-camera. Full-body, dynamic but graceful.",
  seated:
    "Tall elegant female model seated on a low ottoman or marble bench, fabric arranged elegantly around her, legs crossed at the ankle, hands resting in lap, refined posture, soft direct gaze. Full-body framing.",
  looking_back:
    "Tall elegant female model with body turned three-quarters away from camera, head turned back over the shoulder with a soft refined gaze, showcasing both the side of the garment and the back drape. Full-body framing.",
  detail_close:
    "Medium close-up shot from waist up, subtle three-quarter angle, focused on the embroidery, neckline and fabric details of the garment. Hands gently touching the fabric or holding the side. Soft flattering light on the textile.",
  low_angle:
    "Tall elegant female model shot from a slight low angle for a regal, statuesque effect, elongating the silhouette. Subtle three-quarter pose, chin lifted, confident neutral expression. Full-body framing.",
};

let cachedClient: OpenAI | null = null;

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY missing in .env.local");
  }
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey });
  }
  return cachedClient;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  retries = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isRetryable =
        /429|rate.?limit|500|502|503|504|overloaded|timed?\s?out|ECONNRESET|ETIMEDOUT/i.test(
          message,
        );
      if (!isRetryable || attempt === retries) throw error;
      const delay = Math.min(1000 * Math.pow(2, attempt), 16000);
      console.warn(
        `[openai:${label}] retry ${attempt + 1}/${retries} after ${delay}ms — ${message.slice(0, 120)}`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

function buildCompositionHint(pieces: 1 | 2 | 3 | 4, hasShawl: boolean): string | null {
  const parts: string[] = [];
  if (pieces > 1) {
    parts.push(
      `This product is a ${pieces}-piece coordinated set — ALL ${pieces} pieces must be visibly worn or arranged together on the model. Do not show only one piece.`,
    );
  }
  if (hasShawl) {
    parts.push(
      "The product includes a matching shawl/wrap. Show the shawl draped elegantly over the shoulders or arm so it is clearly visible alongside the main garment.",
    );
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

export async function generateBlueMarineImageOpenAI(params: {
  imageBase64: string;
  mimeType: string;
  preset: StylePreset;
  pose: PosePreset;
  pieces?: 1 | 2 | 3 | 4;
  hasShawl?: boolean;
  extraInstructions?: string;
  additionalImages?: Array<{ base64: string; mimeType: string }>;
}): Promise<{ imageBase64: string; mimeType: string }> {
  const client = getClient();
  const stylePrompt = STYLE_PROMPTS[params.preset];
  const posePrompt = POSE_PROMPTS[params.pose];
  const compositionHint = buildCompositionHint(params.pieces ?? 1, params.hasShawl ?? false);

  const houseModel = getHouseModel();
  const hasHouseModel = !!houseModel;
  const additionalImages = params.additionalImages ?? [];
  const garmentImageCount = 1 + additionalImages.length;
  const hasMultipleGarmentViews = garmentImageCount > 1;
  const garmentLastIndex = garmentImageCount;
  const houseModelIndex = garmentLastIndex + 1;

  const garmentRef = hasMultipleGarmentViews
    ? `Images #1 to #${garmentLastIndex} = THE SAME SINGLE GARMENT shown from different angles / closeups (front, back, detail, fabric, etc.). They are MULTIPLE VIEWS of ONE single product — NOT multiple different products. Combine the views to understand the full garment, then reproduce that one garment 1:1.`
    : `Image #1 = THE GARMENT (the only product reference). Reproduce it 1:1.`;
  const garmentRefShort = hasMultipleGarmentViews
    ? `the garment shown across Images #1–#${garmentLastIndex}`
    : `Image #1`;

  const inputsExplained = hasHouseModel
    ? `INPUTS:
- ${garmentRef}
- Image #${houseModelIndex} = THE HOUSE MODEL (the woman). Reproduce her face, skin, hair, body 1:1.

Your job: dress the woman from Image #${houseModelIndex} in ${garmentRefShort}, then photograph her in the requested scene and pose. Ignore any clothing in Image #${houseModelIndex} (she wears the garment instead). Ignore any person in ${hasMultipleGarmentViews ? `Images #1–#${garmentLastIndex}` : `Image #1`} (only the garment matters).`
    : `INPUT: ${garmentRef}
Put THAT single garment, unchanged, on a tall elegant female model.`;

  const prompt = [
    `RULE #1 — GARMENT IS A 1:1 REPRODUCTION`,
    inputsExplained,
    `The garment in your output must look IDENTICAL to ${garmentRefShort} — as if you photographed the same physical garment in a new setting. You are a photographer, not a designer.${
      hasMultipleGarmentViews
        ? ` The multiple garment images (Images #1–#${garmentLastIndex}) all show the SAME ONE garment from different angles. Use them together as references. DO NOT mix them as if they were separate items. There is only one garment.`
        : ""
    }

Reproduce EXACTLY from ${garmentRefShort}: all colors on every panel (top, sleeves, body, skirt, hem, belt, trim) — same hue, same saturation, same zones; all patterns, embroidery, motifs, prints, borders (do not add, do not remove, do not "complete"); length, cut, silhouette, neckline, sleeve shape, proportions; fabric finish (matte / satin / velvet / sheer); trims, belts, ties, buttons, embroidery placement.

NEVER recolor or tint the garment to match the scene. Never add a color (navy, blue, gold, floral, paisley) that is not visible in the reference. Never replace a panel with a different color or fabric. Never "improve" the design — it is already finished. The scene exists only as a backdrop and must not influence the garment in any way.`,
    hasHouseModel
      ? `RULE #2 — WOMAN IS A 1:1 REPRODUCTION OF IMAGE #${houseModelIndex}
The woman is the same person as in Image #${houseModelIndex} — same face, same skin tone, same hair (length, color, texture), same body build (full natural bust, soft curves, defined waist, NOT runway-thin), same apparent age (late 20s / early 30s). Even on back/profile shots, hair / skin / body must match Image #${houseModelIndex}. Do not generate a different woman.`
      : null,
    `SCENE (backdrop only — does NOT affect the garment): ${stylePrompt}`,
    `POSE: ${posePrompt}`,
    compositionHint ? `COMPOSITION: ${compositionHint}` : null,
    params.extraInstructions ? `ADDITIONAL: ${params.extraInstructions}` : null,
    `OUTPUT FRAMING: Vertical portrait (tall fashion editorial format). Full-body shot, model centered, head visible at top with small headroom, feet visible above small floor margin — the entire garment from collar to hem fits inside the frame.`,
    `FINAL CHECK: Compare your mental output to ${garmentRefShort} panel by panel — same colors on every panel? Same patterns and embroidery? Same length and cut? Same fabric finish? If any difference exists, fix it. The garment must be a 1:1 reproduction of ${garmentRefShort}.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const garmentBuffer = Buffer.from(params.imageBase64, "base64");
  const garmentExt = params.mimeType === "image/png" ? "png" : "jpg";
  const garmentFile = await toFile(garmentBuffer, `garment.${garmentExt}`, {
    type: params.mimeType,
  });

  const imageInputs = [garmentFile];
  for (let i = 0; i < additionalImages.length; i++) {
    const img = additionalImages[i];
    const ext = img.mimeType === "image/png" ? "png" : "jpg";
    const buf = Buffer.from(img.base64, "base64");
    const f = await toFile(buf, `garment-angle-${i + 2}.${ext}`, { type: img.mimeType });
    imageInputs.push(f);
  }
  if (houseModel) {
    const modelFile = await toFile(houseModel.data, "house-model.png", {
      type: houseModel.mimeType,
    });
    imageInputs.push(modelFile);
  }

  const response = await withRetry(
    () =>
      client.images.edit({
        model: IMAGE_MODEL,
        image: imageInputs,
        prompt,
        size: "1024x1536",
        quality: "high",
        n: 1,
      }),
    "image",
  );

  const data = response.data?.[0];
  if (!data?.b64_json) {
    throw new Error("OpenAI did not return an image");
  }
  return {
    imageBase64: data.b64_json,
    mimeType: "image/png",
  };
}
