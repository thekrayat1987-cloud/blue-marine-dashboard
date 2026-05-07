import { GoogleGenAI, Modality } from "@google/genai";
import fs from "node:fs";
import path from "node:path";

const MODEL = "gemini-2.5-flash-image";

let cachedHouseModel: { data: string; mimeType: string } | null | undefined;

function getHouseModel(): { data: string; mimeType: string } | null {
  if (cachedHouseModel !== undefined) return cachedHouseModel;
  try {
    const file = path.join(process.cwd(), "public", "house-model.png");
    const buf = fs.readFileSync(file);
    cachedHouseModel = { data: buf.toString("base64"), mimeType: "image/png" };
  } catch {
    cachedHouseModel = null;
  }
  return cachedHouseModel;
}

export type StylePreset = "studio" | "lookbook" | "lifestyle" | "riad" | "palais" | "desert";
export type PosePreset =
  | "front"
  | "three_quarter"
  | "profile"
  | "back"
  | "walking"
  | "seated"
  | "looking_back"
  | "detail_close"
  | "low_angle";

const STYLE_PROMPTS: Record<StylePreset, string> = {
  studio: `Photograph the EXACT garment from the source image, worn by a model, in a luxury studio setting for Blue Marine Atelier.
Background: smooth seamless studio backdrop with a subtle warm gradient (cream to beige).
Lighting: soft, even studio lighting with no harsh shadows; gentle highlights on fabric to reveal embroidery and texture.
Mood: refined, minimalist luxury, contemporary heritage.
Post-processing: faithful color reproduction, moderate contrast, warm overall tone, polished finish.
The background palette must NOT bleed into the garment colors — the garment keeps its exact original colors regardless of the scene's color palette.`,

  lookbook: `Photograph the EXACT garment from the source image, worn by a model, in an editorial lookbook setting for Blue Marine Atelier.
Setting: minimalist architectural interior with arches, warm marble or sandstone textures, subtle Moorish-inspired details.
Lighting: golden-hour natural light filtering through, soft warm glow on the fabric.
Background palette only: bordeaux, gold, ivory accents. The garment itself keeps its exact original colors and patterns — do not tint or recolor it to match the room.
Mood: timeless luxury, modern oriental elegance.`,

  lifestyle: `Photograph the EXACT garment from the source image, worn by a model, in a lifestyle campaign setting for Blue Marine Atelier.
Setting: serene Mediterranean/oriental scene — white-washed walls, lush greenery, soft sunlight, or terrace with sea view.
Lighting: golden hour, warm and luminous, with soft natural shadows.
The garment colors must remain identical to the source — only the surrounding scene uses warm Mediterranean tones.
Mood: aspirational, refined, oriental contemporary luxury.`,

  riad: `Photograph the EXACT garment from the source image, worn by a model, inside an authentic Moroccan riad for Blue Marine Atelier.
Setting: interior courtyard of a traditional riad — zellige tile mosaics on walls and floor, a central marble fountain, carved cedar arches, hanging brass lanterns, terracotta plants.
Lighting: soft diffused daylight from above through the open courtyard, gentle dappled shadows on the model and tiles.
Background palette only: deep teal and cobalt zellige, warm terracotta, brass, ivory walls. The garment keeps its exact original colors — do not let the zellige tones bleed into the fabric.
Mood: heritage luxury, intimate, contemplative.`,

  palais: `Photograph the EXACT garment from the source image, worn by a model, inside a Gulf/Moroccan palace interior for Blue Marine Atelier.
Setting: grand palace interior — black and white marble floor, gilded mouldings, a tall crystal chandelier, ornate mirrors, deep velvet drapes in burgundy or midnight blue.
Lighting: warm chandelier glow with soft golden highlights on the fabric, subtle ambient shadows for depth and drama.
Background palette only: midnight blue, burgundy, polished gold, ivory marble. The garment keeps its exact original colors — drapes and decor do not transfer their colors to the fabric.
Mood: opulent evening occasion, refined, ceremonial.`,

  desert: `Photograph the EXACT garment from the source image, worn by a model, in a cinematic desert setting for Blue Marine Atelier.
Setting: vast golden sand dunes at golden hour, soft wind ripples in the sand, distant horizon, no harsh sun.
Lighting: warm, low-angle golden hour light raking across the dunes, long soft shadows, gentle glow on the fabric.
Background palette only: warm sand, ochre, soft rose-gold sky. The garment keeps its exact original colors and patterns against this neutral background.
Mood: timeless, serene, cinematic, heritage.`,
};

const POSE_PROMPTS: Record<PosePreset, string> = {
  front:
    "Pose: tall elegant female model, perfect frontal pose facing the camera, statuesque posture, arms relaxed beside the body, neutral confident expression. Full-body framing, centered composition, vertical 9:16 portrait aspect (tall fashion editorial format).",
  three_quarter:
    "Pose: tall elegant female model in a refined three-quarter angle (body turned ~30-40° from camera), one foot slightly forward, weight on the back leg for an elongated silhouette, hand resting gently at the waist or letting fabric fall, soft confident gaze toward the camera. Full-body framing, vertical 9:16 portrait aspect (tall fashion editorial format).",
  profile:
    "Pose: tall elegant female model in a clean side profile (90°), chin slightly lifted, arms relaxed, posture statuesque to showcase the garment's silhouette and side embroidery. Full-body framing, vertical 9:16 portrait composition (tall fashion editorial format).",
  back:
    "Pose: tall elegant female model photographed from behind, head turned slightly to reveal jawline, showcasing the back of the garment (neckline, embroidery, drape). Full-body framing, vertical 9:16 portrait composition (tall fashion editorial format).",
  walking:
    "Pose: tall elegant female model captured mid-walk with natural movement, fabric flowing softly, one foot forward, slight side angle, candid look off-camera. Full-body framing, dynamic but graceful, vertical 9:16 portrait composition (tall fashion editorial format).",
  seated:
    "Pose: tall elegant female model seated on a low ottoman or marble bench, fabric arranged elegantly around her, legs crossed at the ankle, hands resting in lap, refined posture, soft direct gaze. Full-body framing, vertical 9:16 portrait composition (tall fashion editorial format).",
  looking_back:
    "Pose: tall elegant female model with body turned three-quarters away from camera, head turned back over the shoulder with a soft refined gaze, showcasing both the side of the garment and the back drape. Full-body framing, vertical 9:16 portrait composition (tall fashion editorial format).",
  detail_close:
    "Framing: medium close-up shot from waist up, subtle three-quarter angle, focused on the embroidery, neckline and fabric details of the garment. Hands gently touching the fabric or holding the side. Soft, flattering light on the textile. Vertical 9:16 portrait composition (tall fashion editorial format).",
  low_angle:
    "Pose: tall elegant female model shot from a slight low angle for a regal, statuesque effect, elongating the silhouette. Subtle three-quarter pose, chin lifted, confident neutral expression. Full-body framing, vertical 9:16 portrait composition (tall fashion editorial format).",
};

let cachedClient: GoogleGenAI | null = null;

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY missing in .env.local");
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey });
  }
  return cachedClient;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  retries = 4,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isRetryable =
        /503|UNAVAILABLE|429|RESOURCE_EXHAUSTED|500|INTERNAL|overloaded|rate.?limit|timed?\s?out/i.test(
          message,
        );
      if (!isRetryable || attempt === retries) throw error;
      const delay = Math.min(1000 * Math.pow(2, attempt), 16000);
      console.warn(
        `[gemini:${label}] retry ${attempt + 1}/${retries} after ${delay}ms — ${message.slice(0, 120)}`,
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
      `This product is a ${pieces}-piece coordinated set — ALL ${pieces} pieces must be visibly worn or arranged together on the model in the generated image. Do not show only one piece.`,
    );
  }
  if (hasShawl) {
    parts.push(
      "The product includes a matching shawl/wrap (châle assorti). Show the shawl draped elegantly over the shoulders or arm so it is clearly visible alongside the main garment.",
    );
  }
  return parts.length > 0 ? `Composition: ${parts.join(" ")}` : null;
}

export async function generateBlueMarineImage(params: {
  imageBase64: string;
  mimeType: string;
  preset: StylePreset;
  pose: PosePreset;
  pieces?: 1 | 2 | 3 | 4;
  hasShawl?: boolean;
  extraInstructions?: string;
}): Promise<{ imageBase64: string; mimeType: string }> {
  const ai = getClient();
  const stylePrompt = STYLE_PROMPTS[params.preset];
  const posePrompt = POSE_PROMPTS[params.pose];
  const compositionHint = buildCompositionHint(params.pieces ?? 1, params.hasShawl ?? false);

  const houseModel = getHouseModel();
  const hasHouseModel = !!houseModel;

  const inputsExplained = hasHouseModel
    ? `# INPUT IMAGES (read carefully — there are TWO)

Image #1 = THE GARMENT. A flat or partial product shot. Use it ONLY as the design reference for the clothing the model wears.
Image #2 = THE HOUSE MODEL. The Blue Marine atelier mannequin. Use her — and ONLY her — as the woman in the output. Same face, same skin tone, same hair, same body type, same height.

Your job: dress the woman from Image #2 in the garment from Image #1, then photograph her in the requested pose and setting.

DO NOT mix the two: the garment in Image #2 (her plain beige dress) is NOT the product — ignore it entirely. The woman in Image #1 (if any) is NOT the model — ignore her face/body entirely.`
    : `# INPUT IMAGE
The source image shows the garment. Put THAT garment, unchanged, on a tall elegant female model.`;

  const garmentLock = `# GARMENT FIDELITY — HIGHEST PRIORITY (read before anything else)

${inputsExplained}

The garment image (Image #1) shows ONE specific garment. Treat the garment like a real physical object you must reproduce 1:1.

You MUST copy from the garment image, exactly:
- Every color and color zone — including the dominant color of each part (top, sleeves, skirt, belt, hem). If the skirt is orange/brown in the source, it stays orange/brown.
- Every pattern, motif and print — geometric shapes, embroidery, prints, borders. Do not add new patterns. Do not remove existing patterns.
- The full length, cut, silhouette, neckline, sleeves, and proportions.
- The fabric type and finish (matte, sheen, velvet, satin) as visible in the source.
- Trims, belts, ties, buttons, embroidery placement.

You MUST NOT, under any circumstance:
- Add navy blue, midnight blue, or any color not present in the source garment.
- Add floral patterns, paisley, or any motif not present in the source garment.
- Replace the skirt or any panel with a different fabric or color.
- "Complete" or "enrich" the design because it looks simple. Simplicity is intentional.
- Let the background scene or palette tint or recolor the garment.
- Change the garment length (do not turn a long dress into a short one or vice-versa).

If you are tempted to make the garment "more interesting", stop. The garment is already finished. You are only a photographer choosing the scene, lighting, and pose.
${
  hasHouseModel
    ? `

# MODEL IDENTITY LOCK — HIGHEST PRIORITY (alongside garment fidelity)

The woman in the output MUST be the exact same person as in Image #2 (the house model). This is non-negotiable — every Blue Marine product photo features the SAME woman so the catalog has one consistent face.

Copy from Image #2, exactly:
- Face: same bone structure, same eyes (shape, color, spacing), same nose, same lips, same jawline, same eyebrows. Treat her face like a real person you are re-photographing.
- Skin: same olive tone, same warm undertone, same complexion.
- Hair: same length (past shoulders), same dark brown color, same texture (straight to softly wavy).
- Body: same build — full natural bust, soft feminine curves, defined waist, NOT runway-thin. Tall, statuesque.
- Age: same apparent age (late 20s to early 30s).

You MUST NOT:
- Generate a different woman, even if the pose calls for a different angle.
- Make her younger, older, slimmer, or change her ethnicity.
- Change her hair color, length, or texture.
- Change her face in any way the viewer would notice side-by-side with Image #2.

If the requested pose hides her face (e.g. back view, profile), her body, hair and skin still match Image #2.`
    : ""
}

# OUTPUT FRAMING — MANDATORY
- Aspect ratio: vertical 9:16 portrait (width:height = 9:16, i.e. a tall fashion editorial format).
- Composition: full-body model centered horizontally, head visible at the top with a small headroom margin, feet clearly visible above a small floor margin at the bottom — the entire silhouette of the garment from collar to hem must fit inside the frame.
- All generated images for Blue Marine MUST share this exact 9:16 portrait ratio so the catalog is visually uniform.`;

  const prompt = [
    garmentLock,
    stylePrompt,
    posePrompt,
    compositionHint,
    params.extraInstructions ? `Additional instructions: ${params.extraInstructions}` : null,
    "FINAL CHECK before generating: compare your mental image to the source. Same colors on every part? Same patterns? Same length? Same cut? If anything differs, fix it before outputting.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await withRetry(
    () =>
      ai.models.generateContent({
        model: MODEL,
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              { inlineData: { mimeType: params.mimeType, data: params.imageBase64 } },
              ...(houseModel
                ? [{ inlineData: { mimeType: houseModel.mimeType, data: houseModel.data } }]
                : []),
            ],
          },
        ],
        config: {
          responseModalities: [Modality.IMAGE],
        },
      }),
    "image",
  );

  const candidate = response.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      return {
        imageBase64: part.inlineData.data,
        mimeType: part.inlineData.mimeType ?? "image/png",
      };
    }
  }

  const textFeedback = parts.find((p) => p.text)?.text;
  throw new Error(
    textFeedback
      ? `Gemini did not return an image: ${textFeedback}`
      : "Gemini did not return an image",
  );
}

export type LocalizedDescription = {
  title: string;
  description: string;
  pageTitle: string;
  metaDescription: string;
};

export type ProductDescription = {
  sku: string;
  urlHandle: string;
  en: LocalizedDescription;
  ar: LocalizedDescription;
  tags: string[];
};

const TEXT_MODEL = "gemini-2.5-flash";
const TEXT_MODEL_FALLBACK = "gemini-2.5-flash-lite";

export async function generateProductDescription(params: {
  imageBase64: string;
  mimeType: string;
  sku?: string;
  pieces?: 1 | 2 | 3 | 4;
  hasShawl?: boolean;
  usedNames?: string[];
  colorList?: string[];
}): Promise<ProductDescription> {
  const ai = getClient();
  const sku = params.sku?.trim() || "AXXX";
  const pieces = params.pieces ?? 1;
  const hasShawl = params.hasShawl ?? false;
  const usedNames = params.usedNames ?? [];
  const colorList = (params.colorList ?? [])
    .map((c) => c?.trim())
    .filter((c): c is string => Boolean(c));

  const piecesArabic: Record<1 | 2 | 3 | 4 | 5, string> = { 1: "١", 2: "٢", 3: "٣", 4: "٤", 5: "٥" };
  const totalPieces = Math.min(5, pieces + (hasShawl ? 1 : 0)) as 1 | 2 | 3 | 4 | 5;
  const pieceCountEn = totalPieces > 1 ? `${totalPieces}-Piece Set` : null;
  const pieceCountAr = totalPieces > 1 ? `طقم ${piecesArabic[totalPieces]} قطع` : null;

  const compositionFacts: string[] = [];
  if (totalPieces > 1)
    compositionFacts.push(
      `${totalPieces}-piece coordinated set (ensemble ${totalPieces} pièces)${hasShawl ? ` — ${pieces} main piece${pieces > 1 ? "s" : ""} + 1 matching shawl counted as a piece` : ""}`,
    );
  if (hasShawl) compositionFacts.push("includes a matching shawl (counted in the total piece count)");
  const compositionBlock = compositionFacts.length
    ? `\n\n# COMPOSITION (must be reflected in title, description and tags)\nThis product is: ${compositionFacts.join(", ")}.\n- The shawl counts as a piece in the total. Title MUST say "${pieceCountEn}". Description MUST say "${totalPieces === 2 ? "two" : totalPieces === 3 ? "three" : totalPieces === 4 ? "four" : "five"}-piece set" (NOT a lower number).\n- If a shawl is included, mention it as a matching shawl / châle assorti / شال مطابق as one of the pieces.\n- Add relevant tags such as "${totalPieces}-piece", "set"${hasShawl ? ', "shawl"' : ""}.\n`
    : "";

  const colorsBlock = colorList.length > 1
    ? `\n\n# AVAILABLE COLORS — MUST be reflected in description AND tags
This product is offered in ${colorList.length} colors. The PRIMARY color (shown in the photo) is "${colorList[0]}". The other available color${colorList.length > 2 ? "s are" : " is"}: ${colorList.slice(1).map((c) => `"${c}"`).join(", ")}.
- The English description MUST add ONE short sentence at the end of paragraph 1 OR start of paragraph 3 that names every color, e.g. "Also available in ${colorList.slice(1).join(" and ")}." Use plain language, no marketing fluff.
- The Arabic description MUST do the same in Arabic, e.g. "متوفر أيضًا باللون ${colorList.slice(1).join(" و")}". Translate each color name to Arabic if it is not already (أخضر = green, أزرق = blue, أحمر = red, أسود = black, أبيض = white, ذهبي = gold, فضي = silver, بنفسجي = purple, وردي = pink, بيج = beige, زيتي = olive, نيلي = navy, عنابي = burgundy).
- The tags array MUST include EACH color name as a separate lowercase English tag (e.g. ${colorList.map((c) => `"${c.toLowerCase()}"`).join(", ")}).
- Do NOT describe the photo's color as the only color of the product — make it clear other colors exist.
`
    : "";

  const forbiddenBlock = usedNames.length
    ? `\n\n⚠️ FORBIDDEN NAMES — already used on other products in the catalogue, you MUST pick a different one:\n${usedNames.map((n) => `- ${n}`).join("\n")}\n`
    : "";

  const prompt = `You write product copy for Atelier Blue Marine — a Kuwait luxury atelier of Gulf / Middle-Eastern heritage womenswear (daraa, caftan, abaya, bisht, layered sets, embroidered tunics, velvet bishts).${compositionBlock}${colorsBlock}${forbiddenBlock}

# SKU RULE — ABSOLUTE, READ FIRST
The product SKU is exactly: ${sku}
- Every "title" field (en.title, ar.title) MUST start with "${sku} – " (the SKU, then a space, an en-dash "–", and a space). Copy "${sku}" character-for-character.
- The "sku" field MUST be exactly "${sku}".
- The "urlHandle" field MUST start with "${sku.toLowerCase()}-".
- DO NOT invent or substitute any other code (no "ABM…", "BM…", "ATL…", no 3-letter prefixes, no different number). The SKU is "${sku}" and only "${sku}".
- "pageTitle" and "metaDescription" must NOT contain any SKU code.

# NAMING RULE — give the piece a POETIC NAME (one or two words)
Each product gets a POETIC NAME that gives it an identity, then a short descriptor. Like a fashion house naming each piece. Existing examples in the catalogue: "Noor Heritage Daraa", "Zafira Mosaic Daraa", "Layal Silk Daraa", "Zaria Burgundy Daraa", "Desert Drift Daraa", "Amara Plum Daraa".

NAME INSPIRATION POOL — pick ONE distinctive name that fits the garment's mood (color, occasion, fabric):
- Gulf feminine names: Noor, Layla, Layali, Yasmin, Amira, Zahra, Lulwa, Hessa, Dana, Sara, Hala, Maryam, Aisha, Latifa, Mariam, Sheikha, Sultana, Zafira, Amara, Zaria, Layal, Lina, Reem, Nada, Ghada
- Arabic poetic words: Noor (light), Layali (nights), Sahar (dawn), Amal (hope), Aman (peace), Hawa (breeze), Bahar (sea), Falaj (oasis), Zumurud (emerald), Yaqut (ruby), Lu'lu (pearl), Marjan (coral)
- Heritage/places: Mubarakiya, Bandar, Diwaniya, Khaleej, Souq, Riad, Sahara
- Moods: Midnight, Royal, Heritage, Mosaic, Velvet Bloom, Golden Hour, Desert Rose, Ocean, Sunset

# GARMENT IDENTIFICATION — LOOK AT THE PHOTO FIRST
Before writing anything, identify the garment shown in the image. Pick ONE from this list based on what you actually see:
- **daraa (درّاعة)** — long, flowing one-piece Gulf gown, usually loose, often embroidered. Most common in this catalogue. If you see ONE flowing dress with no separate outer layer, it is a daraa.
- **caftan (قفطان)** — long robe with a front opening or buttons down the centre.
- **abaya (عباية)** — open-front overgarment, usually black or dark, worn over other clothing.
- **bisht (بشت)** — a sheer/embroidered OUTER cloak worn OVER an inner garment (almost always part of a 2-piece set with a daraa underneath). DO NOT label a single flowing dress as a "bisht".
- **set / bisht-set** — only when the photo or the COMPOSITION block clearly indicates 2+ coordinated pieces.
⚠️ NEVER default to "bisht" if you are unsure. When in doubt between daraa and bisht, choose **daraa**. A bisht is an outer cloak worn over something — not a standalone dress.

# ENGLISH TITLE RULES (en.title)
- Format: "${sku} – Name + Garment${pieceCountEn ? ` + ${pieceCountEn}` : ""}".
- Max 65 characters total. The NAME comes first after the dash, then the garment + key detail.
- ⚠️ Use the garment name you identified above. Do NOT write "Bisht" unless the image actually shows an outer cloak.
- For an actual outer Gulf cloak, ALWAYS write "Bisht" — NEVER "Overcoat", "Coat", "Cloak" or "Robe".
${totalPieces === 1
  ? `- ⚠️ PIECE COUNT — THIS PRODUCT HAS ONE PIECE.
  · DO NOT add any piece count to the title. The title ends with the garment name.
  · NEVER write "2-Piece", "3-Piece", "Set", "Bisht Set", "(One Piece)" or any count phrase.
  · Correct examples: "${sku} – Layali Daraa", "${sku} – Amara Caftan", "${sku} – Noor Abaya".
  · Wrong: "${sku} – Layali 2-Piece Bisht Set" (this product is ONE piece, not a set).`
  : `- ⚠️ PIECE COUNT — THIS PRODUCT HAS ${totalPieces} PIECES${hasShawl ? ` (${pieces} main piece${pieces > 1 ? "s" : ""} + matching shawl)` : ""}.
  · Write exactly "${pieceCountEn}" (hyphen, capital P, capital S) before the garment word.
  · Correct example: "${sku} – Zumurud ${pieceCountEn} Bisht Set".
  · NEVER use "Two-Piece" / "Three-Piece" — always digit + hyphen + "Piece".`}
- Color is OPTIONAL. The photo already shows the color, so you can omit it for a cleaner title — only include it when it is a defining trait (e.g. "Royal Navy", "Ivory") and helps SEO.
- Don't reuse a name that's already in the FORBIDDEN list above. Pick a name that fits THIS specific garment.
- Plain English. No marketing fluff. No "exquisite / captivating / stunning / regal / opulent".

# ARABIC TITLE RULES (ar.title)
- Format: "${sku} – الاسم بالعربية + وصف قصير"
- Use the SAME poetic name as in English, written in Arabic script (transliteration).
  · Example: Layali → ليالي, Zumurud → زمرّد, Noor → نور, Zafira → ظفيرة, Amara → أمارا
- Then add the garment + key detail in formal but simple Arabic.
- Use Gulf vocabulary: بشت، درّاعة، قفطان، عباية، مخمل، حرير، مطرّز، طقم، ٢ قطع، ٣ قطع، تراثي، شال.
- ⚠️ Use the SAME garment word you chose in English. If English says "Daraa", Arabic says "درّاعة". If English says "Caftan", Arabic says "قفطان". Do NOT switch to "بشت" unless the English title also uses "Bisht".
- For an actual outer cloak, use "بشت" — NEVER "معطف".
- ⚠️ PIECE-COUNT FORMAT — match the English version exactly:
${totalPieces === 1
  ? `  · ONE piece → NO piece count in Arabic. The title ends with the garment word. Do NOT write "طقم", "٢ قطع", "٣ قطع" or any set/count word.`
  : `  · This product has ${totalPieces} pieces → write "${pieceCountAr}" with Arabic-Indic numerals.`}
- Keep the SKU prefix in Latin (do not translate the SKU).
- Max 65 characters.

# DESCRIPTION + SEO WRITING RULES — read carefully, follow strictly

1. Plain, simple, natural English. Short sentences (max ~15 words). Read aloud — must sound human, not like a perfume ad.
2. Concrete details over poetry. Say "olive silk velvet, gold thread embroidery on the neckline" — not "captivating elegance".
3. No filler adjectives stacked together. Pick ONE adjective max per noun.
4. Active voice. Specific verbs. Avoid "evokes / evoking", "embraces", "celebrates", "captures the essence of".
5. ⚠️ For "dress" or "inner dress" or "robe" in Arabic, ALWAYS write "درّاعة" (or "درّاعة داخلية" for inner dress). NEVER use "فستان" — that is generic and Western. The brand uses "درّاعة" for the traditional Gulf dress.
6. ⚠️ DO NOT mention Ramadan unless the product is a literal Ramadan capsule piece. The garments are worn YEAR-ROUND (weddings, henna nights, formal evenings, family gatherings, Eid, special occasions). Tying every product to Ramadan limits SEO discovery to a 1-month window. Use general occasions: evening, wedding, henna, gathering, formal, eid, special-occasion, dinner.
7. Total length: 60-90 words across 3 short paragraphs (EN). Same in AR.
8. Banned words / phrases — DO NOT USE any of these:
   exquisite, captivating, captivate, evoke, evokes, evoking, evocative, allure, alluring, mystique, embrace, embraces, journey, celebration of, statement piece, must-have, sophisticated, sophisticated allure, enchanting, mesmerizing, breathtaking, stunning, gorgeous, lovely, dreamy, ethereal, gracefully, exquisitely, beautifully, masterfully, intricate (overused), cascade, cascading, adorned, adorning, luminous, radiant, opulent, lavish, regal, majestic.
9. AR: also avoid embellished marketing arabic. Short clear sentences.

# GOOGLE SEO — RANK HIGH IN KUWAIT SEARCHES
Atelier Blue Marine wants to rank top-3 on Google for these intent searches in both EN + AR:
- "abaya Kuwait", "daraa Kuwait", "bisht women Kuwait", "luxury daraa Kuwait"
- "عباية الكويت", "درّاعة الكويت", "بشت نسائي الكويت", "أتيليه كويتي"
- "Gulf heritage clothing", "Khaleeji daraa", "abaya online Kuwait"
- Garment-specific: "velvet bisht", "embroidered daraa", "wedding bisht"
SEO RULES:
- Page title MUST include: garment type (bisht/daraa/caftan/abaya) + 1 distinctive trait + brand name. Front-load keywords: garment type comes first, brand last. (50-70 chars).
- Page title (AR) mirrors the EN structure with "أتيليه بلو مارين" at the end.
- Page title NEVER contains the SKU prefix.
- Meta description MUST include: garment type, color/material, occasion (general), AND the word "Kuwait" or "Atelier Blue Marine" once.
- Tags must include the Arabic spelling AND English of the garment type — duplicate keys help search (e.g. "bisht" AND "بشت", "daraa" AND "درّاعة").
- Description (body_html) MUST mention: garment type by name (bisht/daraa/caftan/abaya), fabric, occasion, and where appropriate "Kuwait" or "Gulf heritage" (once, naturally).
- Use the SKU's poetic name as the brand-distinctive token (Yaqut, Layali, Zumurud, etc.) — this is the canonical product name on Google. Include it in the page title as the distinctive trait when natural.

# DESCRIPTION STRUCTURE — 3 paragraphs, separated by \\n\\n

PARAGRAPH 1 — what it is. Garment type + main visual fact (color, fabric).
PARAGRAPH 2 — one specific detail that matters (embroidery placement, cut, layering, sleeve, set composition).
PARAGRAPH 3 — when to wear it (1 short sentence) + a separate sentence about fabric/feel.

# TAGS — 10-12 lowercase Shopify tags optimized for Google + Shopify search
Required mix:
- garment type: pick from {bisht, daraa, caftan, abaya, kaftan, set, bisht-set, daraa-set}
- color (1-2 dominant): {green, emerald, burgundy, navy, ivory, gold, black, …}
- fabric: {velvet, silk, chiffon, embroidered, brocade, …}
- occasion (NO ramadan unless capsule): {evening, wedding, henna, eid, gathering, formal, special-occasion}
- style: {heritage, gulf, khaleeji, kuwait, luxury, traditional}
- ALWAYS include 1 transliteration/locale tag like "kuwait" or "khaleeji".
- Single-word or short hyphenated. No "#", no commas inside tags.

# URL HANDLE
- Lowercase, hyphen-separated, ASCII only.
- Format: "${sku.toLowerCase()}-<poetic-name-slug>-<garment>" (use the poetic name from the title + 1-2 garment words).
- Example: "a11-yaqut-emerald-bisht-set".

# REFERENCE — your output must read like this (style, length, tone)

TITLE: "${sku} – Layali Caftan"

DESCRIPTION:
A flowing caftan in olive silk velvet, with a soft sheen that shifts in the light.

Hand-embroidered motifs trace the neckline, sleeves and hem in golden thread.

Wear it for evenings, weddings or family gatherings in Kuwait. The fabric is light and breathes well.

PAGE TITLE: "Caftan Layali – Olive Velvet, Atelier Blue Marine"
META DESCRIPTION: "Olive silk velvet caftan with hand-embroidered neckline. Made in Kuwait by Atelier Blue Marine for weddings, henna and formal evenings."

# OUTPUT

Return ONLY valid JSON (no backticks, no markdown):
{
  "sku": "${sku}",
  "urlHandle": "${sku.toLowerCase()}-<poetic-name>-<garment>",
  "en": {
    "title": "${sku} – <PoeticName> <Garment>${pieceCountEn ? ` ${pieceCountEn}` : ""} (literal SKU prefix mandatory, max 65 chars)",
    "description": "3 short paragraphs separated by \\n\\n, following the rules above. 60-90 words total. NO banned words. Mention garment type + 'Kuwait' or 'Gulf heritage' naturally.",
    "pageTitle": "[Garment] [PoeticName/Trait] – Atelier Blue Marine (garment FIRST, 50-70 chars, no SKU)",
    "metaDescription": "130-160 chars, includes garment type + color/material + occasion + 'Kuwait' or 'Atelier Blue Marine' once"
  },
  "ar": {
    "title": "${sku} – <الاسم بالعربية> <القماش/القطعة>${pieceCountAr ? ` ${pieceCountAr}` : ""} (يجب الحفاظ على رمز SKU كما هو، ٦٥ حرفاً كحد أقصى)",
    "description": "ثلاث فقرات قصيرة مفصولة بـ \\n\\n، بأسلوب طبيعي وبسيط. ٦٠-٩٠ كلمة إجماليًا. جمل قصيرة وواضحة. لا تستخدم كلمات مكررة أو زخرفة لغوية مفرطة. اذكري نوع القطعة و'الكويت' أو 'أتيليه بلو مارين' بشكل طبيعي.",
    "pageTitle": "[القطعة] [الاسم] – أتيليه بلو مارين (نوع القطعة أولاً، ٥٠-٧٠ حرفاً، بدون SKU)",
    "metaDescription": "وصف ميتا ١٣٠-١٦٠ حرفاً، يذكر نوع القطعة + اللون/القماش + المناسبة + 'الكويت' أو 'أتيليه بلو مارين' مرة واحدة"
  },
  "tags": ["10-12 lowercase Shopify tags. MUST include both EN and AR spelling of garment type (e.g. 'bisht' AND 'بشت', 'daraa' AND 'درّاعة'). Mix: garment EN+AR, color, fabric, occasion (NO ramadan unless capsule), style, kuwait/khaleeji"]
}

# ARABIC DESCRIPTION RULES (same spirit)
- لغة فصحى بسيطة، جمل قصيرة، تفاصيل محسوسة (لون، قماش، تطريز).
- ابتعد عن الصياغات المنمقة والكلمات المكررة.
- ٣ فقرات قصيرة فقط، جملة أو جملتين لكل فقرة.
- استخدمي "درّاعة" وليس "فستان" للإشارة للقطعة الداخلية.

CRITICAL CHECKS — re-read your output before returning JSON:
1. Did you label a single flowing dress as "Bisht" or "Bisht Set"? If yes, REWRITE — it is a daraa (or caftan/abaya).
${totalPieces === 1
  ? `2. Does any title contain "2-Piece", "3-Piece", "Set", "Bisht Set", "طقم", "٢ قطع", or "٣ قطع"? This product has ONE piece — REMOVE all count/set words and rewrite the title.`
  : `2. Does the EN title contain "${pieceCountEn}" and the AR title contain "${pieceCountAr}"? If not, REWRITE.`}
3. Did you use any banned word (exquisite, captivating, evoking, celebration of, Ramadan unless capsule, فستان)? DELETE the sentence and rewrite factually.
4. Did you write "Two-Piece" or "Three-Piece" instead of "2-Piece" / "3-Piece"? REWRITE.`;

  const callModel = (model: string) =>
    ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType: params.mimeType, data: params.imageBase64 } },
          ],
        },
      ],
      config: { responseMimeType: "application/json" },
    });

  let response;
  try {
    response = await withRetry(() => callModel(TEXT_MODEL), "description");
  } catch (err) {
    console.warn(
      `[gemini:description] primary model failed, trying fallback ${TEXT_MODEL_FALLBACK} — ${err instanceof Error ? err.message.slice(0, 120) : ""}`,
    );
    response = await withRetry(() => callModel(TEXT_MODEL_FALLBACK), "description-fallback");
  }

  const text = response.text;
  if (!text) {
    throw new Error("Gemini did not return text for product description");
  }

  try {
    return JSON.parse(text) as ProductDescription;
  } catch {
    throw new Error("Failed to parse product description JSON");
  }
}

export type ReelScene = {
  shot: string;
  action: string;
  onScreenText: string;
  voiceOver: string;
};

export type ReelScript = {
  hook: string;
  scenes: ReelScene[];
  cta: string;
  musicMood: string;
};

export type MarketingPack = {
  instagram: {
    en: { caption: string; hashtags: string[] };
    ar: { caption: string; hashtags: string[] };
  };
  whatsapp: {
    en: string;
    ar: string;
  };
  reel: {
    ar: ReelScript;
  };
};

export async function generateMarketingPack(params: {
  imageBase64: string;
  mimeType: string;
  productTitle: string;
  productDescription: string;
  productUrl?: string;
}): Promise<MarketingPack> {
  const ai = getClient();
  const productUrl = params.productUrl?.trim() || "https://bluemarine-atelier.com";

  const prompt = `You are the brand voice of Atelier Blue Marine — a Kuwait luxury atelier crafting Moroccan and Middle-Eastern heritage womenswear (caftans, daraa, abayas, embroidered tunics).

Tone: refined luxury, warm but understated. Plain language, no marketing fluff. Never use: exquisite, captivating, evoke, allure, embrace, journey, statement piece, must-have, stunning, gorgeous, cascade, adorned, regal, opulent, lavish.

# CONTEXT

Product: ${params.productTitle}
Description: ${params.productDescription}
Product link: ${productUrl}

# OUTPUT — return ONLY valid JSON (no backticks, no markdown), matching this exact shape:

{
  "instagram": {
    "en": {
      "caption": "3-4 short lines in English. Hook on line 1 (one sensory detail or question). Body: 1-2 lines describing the piece (color, fabric, occasion). Soft CTA on last line (e.g. 'Link in bio' or 'DM to order'). 1-2 tasteful emojis MAX. Max 280 chars.",
      "hashtags": ["array of 15 hashtags. Mix: 5 brand+product (#BlueMarine #AtelierBlueMarine #Caftan #Abaya #ModestFashion), 5 Gulf market (#Q8 #Q8Style #KuwaitFashion #GCCFashion #Khaleeji #DubaiFashion), 5 niche (#LuxuryAbaya #HandEmbroidery #SilkVelvet #EidOutfit #RamadanStyle). Pick the 15 most relevant to THIS product. No # spaces, no duplicates."]
    },
    "ar": {
      "caption": "نفس البنية بالعربية الفصحى البسيطة، ٣-٤ أسطر قصيرة، إيموجي ١-٢ كحد أقصى، دعوة للحجز في النهاية. ٢٨٠ حرف كحد أقصى.",
      "hashtags": ["15 Arabic + Gulf hashtags mixed: #الكويت #اطلالات_الكويت #عبايات #قفطان #ازياء_خليجية #رمضان #العيد + relevant brand/product tags. Pick the 15 most relevant."]
    }
  },
  "whatsapp": {
    "en": "Short WhatsApp Broadcast message in English. Format: 1 emoji + product hook (1 line) + 2-3 lines describing the piece + price/availability hint + 'Link: ${productUrl}' + warm closing line. Use line breaks (\\n). Max 400 chars. Tone: like a personal message from a Kuwaiti boutique owner to a client.",
    "ar": "نفس الرسالة بالعربية، أسلوب شخصي دافئ كأنها من صاحبة الأتيليه لعميلتها. نفس البنية: عنوان + وصف قصير + الرابط + ختام. ٤٠٠ حرف كحد أقصى."
  },
  "reel": {
    "ar": {
      "hook": "جملة جذابة قصيرة بالعربية لأول ثانيتين، ٨ كلمات كحد أقصى. اجعليها توقف التمرير",
      "scenes": [
        { "shot": "نوع اللقطة بالعربية (مثل: 'لقطة قريبة للقماش'، 'لقطة عامة للمنتج'، 'تفصيل التطريز')", "action": "ماذا يحدث في اللقطة (جملة قصيرة بالعربية)", "onScreenText": "نص يظهر على الشاشة بالعربية (٦ كلمات كحد أقصى)", "voiceOver": "نص الصوت بالعربية (جملة قصيرة)" },
        { "shot": "...", "action": "...", "onScreenText": "...", "voiceOver": "..." },
        { "shot": "...", "action": "...", "onScreenText": "...", "voiceOver": "..." },
        { "shot": "...", "action": "...", "onScreenText": "...", "voiceOver": "..." }
      ],
      "cta": "دعوة ختامية على الشاشة بالعربية، ٦ كلمات كحد أقصى",
      "musicMood": "اقتراح موسيقى بالعربية: المزاج والأسلوب (مثل: 'عود هادئ وأنيق' أو 'إيقاع خليجي عصري')"
    }
  }
}

# RULES
- Total reel target duration: 15 seconds, so 4 scenes of ~3 sec each.
- Hashtags: lowercase except hashtag words that are proper nouns. No spaces inside a tag. Use Arabic hashtags with underscores where needed (e.g. #اطلالات_الكويت).
- Be concrete: name the actual color, fabric and one specific detail (embroidery placement, sleeve cut) drawn from the product description and image.
- Arabic must be natural Modern Standard Arabic, simple and warm — not flowery.
- WhatsApp messages: write like a real boutique owner messaging a client, not a brand bot.
- If you find yourself writing any banned word, rewrite the sentence factually.`;

  const callModel = (model: string) =>
    ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType: params.mimeType, data: params.imageBase64 } },
          ],
        },
      ],
      config: { responseMimeType: "application/json" },
    });

  let response;
  try {
    response = await withRetry(() => callModel(TEXT_MODEL), "marketing-pack");
  } catch (err) {
    console.warn(
      `[gemini:marketing-pack] primary model failed, trying fallback ${TEXT_MODEL_FALLBACK} — ${err instanceof Error ? err.message.slice(0, 120) : ""}`,
    );
    response = await withRetry(() => callModel(TEXT_MODEL_FALLBACK), "marketing-pack-fallback");
  }

  const text = response.text;
  if (!text) {
    throw new Error("Gemini did not return text for marketing pack");
  }

  try {
    return JSON.parse(text) as MarketingPack;
  } catch {
    throw new Error("Failed to parse marketing pack JSON");
  }
}

export async function generateStoryPoster(params: {
  imageBase64: string;
  mimeType: string;
  productTitle: string;
}): Promise<{ imageBase64: string; mimeType: string }> {
  const ai = getClient();

  const prompt = `Create an Instagram Story poster (vertical 9:16 aspect, 1080x1920) for the luxury Kuwait atelier "Atelier Blue Marine".

Product to feature: ${params.productTitle}
Source image attached: use the EXACT garment, model, fabric, color and details — do not invent or alter the design.

# COMPOSITION
- Vertical format, full-bleed background.
- Place the model/garment as the hero, occupying roughly the center-to-bottom 70% of the frame.
- Reserve clean negative space at the top (~25% of height) for the brand mark and product name overlay.
- Center the subject horizontally with breathing room on both sides.

# AESTHETIC
- Luxury, refined, contemporary heritage. Moroccan/Middle-Eastern atelier feel.
- Background: smooth warm gradient (cream → soft beige → muted gold), or subtle textural backdrop (silk, marble, sandstone) — never busy.
- Lighting: soft, even, golden-hour glow. No harsh shadows.
- Color palette: deep blue marine (#1B2A4E), warm cream, golden ochre, ivory accents.
- Mood: quiet luxury, editorial, calm.

# TYPOGRAPHY OVERLAY (render directly into the image, in the negative space at top)
- Top center: brand wordmark "BLUE MARINE" in elegant serif, small caps, generous letter-spacing, ivory color, modest size.
- Just under the wordmark: product name "${params.productTitle}" in a refined italic serif, slightly smaller, in soft gold or cream.
- Use clean, professional, well-rendered Latin typography. Do NOT distort letters.
- No other text, no hashtags, no decorative borders.

# STRICT RULES
- Preserve the EXACT garment from the source image (cut, fabric, embroidery, color, proportions, model pose if visible).
- Vertical 9:16 aspect mandatory.
- Output a single polished poster ready to publish as an Instagram Story.`;

  const response = await withRetry(
    () =>
      ai.models.generateContent({
        model: MODEL,
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              { inlineData: { mimeType: params.mimeType, data: params.imageBase64 } },
            ],
          },
        ],
        config: {
          responseModalities: [Modality.IMAGE],
        },
      }),
    "story-poster",
  );

  const candidate = response.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      return {
        imageBase64: part.inlineData.data,
        mimeType: part.inlineData.mimeType ?? "image/png",
      };
    }
  }
  const textFeedback = parts.find((p) => p.text)?.text;
  throw new Error(
    textFeedback
      ? `Gemini did not return a story poster: ${textFeedback}`
      : "Gemini did not return a story poster",
  );
}

