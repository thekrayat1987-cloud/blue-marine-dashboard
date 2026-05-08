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
  studio: `Scene: luxury studio backdrop, subtle warm cream-to-beige gradient.
Lighting: soft, even studio lighting; gentle highlights on fabric to reveal embroidery and texture; no harsh shadows.
Mood: refined, minimalist luxury, contemporary heritage.
The scene is a backdrop only. The garment is reproduced 1:1 from Image #1.`,

  lookbook: `Scene: minimalist architectural interior with arches, warm marble/sandstone textures, subtle Moorish details.
Lighting: golden-hour natural light filtering through, soft warm glow.
Mood: timeless luxury, modern oriental elegance.
The scene is a backdrop only. The garment is reproduced 1:1 from Image #1.`,

  lifestyle: `Scene: serene Mediterranean/oriental setting — white-washed walls, lush greenery, soft sunlight, or terrace with sea view.
Lighting: golden hour, warm and luminous, soft natural shadows.
Mood: aspirational, refined, oriental contemporary luxury.
The scene is a backdrop only. The garment is reproduced 1:1 from Image #1.`,

  riad: `Scene: interior courtyard of a traditional Moroccan riad — zellige tile mosaics, central marble fountain, carved cedar arches, hanging brass lanterns, terracotta plants.
Lighting: soft diffused daylight from above through the open courtyard, gentle dappled shadows.
Mood: heritage luxury, intimate, contemplative.
The scene is a backdrop only. The garment is reproduced 1:1 from Image #1.`,

  palais: `Scene: grand palace interior — marble floor, gilded mouldings, crystal chandelier, ornate mirrors, velvet drapes.
Lighting: warm chandelier glow with soft highlights, subtle ambient shadows for depth.
Mood: opulent evening occasion, refined, ceremonial.
The scene is a backdrop only. The garment is reproduced 1:1 from Image #1.`,

  desert: `Scene: vast golden sand dunes at golden hour, soft wind ripples, distant horizon, no harsh sun.
Lighting: warm low-angle golden-hour light raking across the dunes, long soft shadows.
Mood: timeless, serene, cinematic, heritage.
The scene is a backdrop only. The garment is reproduced 1:1 from Image #1.`,
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
  additionalImages?: Array<{ base64: string; mimeType: string }>;
}): Promise<{ imageBase64: string; mimeType: string }> {
  const ai = getClient();
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

  const garmentImagesLabel = hasMultipleGarmentViews ? `Images #1–#${garmentLastIndex}` : `Image #1`;
  const inputsExplained = hasHouseModel
    ? `# INPUTS
${garmentRef}
Image #${houseModelIndex} = THE HOUSE MODEL (the woman). Reproduce her face, skin, hair, body 1:1.

Your job: dress the woman from Image #${houseModelIndex} in the garment shown in ${garmentImagesLabel}, then photograph her in the requested scene and pose.
Ignore any clothing in Image #${houseModelIndex} (she wears the garment instead).

⚠️ IDENTITY LOCK — CRITICAL
${garmentImagesLabel} may show a real person wearing the garment (a fitting model, a customer, a mannequin, hands holding the fabric, etc.). That person is NOT the model of the output.
- DISCARD EVERYTHING about any person visible in ${garmentImagesLabel}: face, eyes, eyebrows, mouth, nose, jaw, hair (length, color, style), skin tone, body shape, height, weight, age, posture, hands.
- Use ${garmentImagesLabel} ONLY as a clothing reference (fabric, color, embroidery, cut, length, drape).
- The ONLY human in the output is the woman from Image #${houseModelIndex}. Her face, hair, skin, and body shape are the ONLY ones that appear — never blend, never average, never substitute with the person from ${garmentImagesLabel}.
- If you feel tempted to copy the silhouette or face from ${garmentImagesLabel} because it shows the garment "in action", STOP. Re-read this rule and use Image #${houseModelIndex} instead.`
    : `# INPUT
${garmentRef}
Put THAT single garment, unchanged, on a tall elegant female model.`;

  const garmentRefShort = hasMultipleGarmentViews
    ? `the garment shown across Images #1–#${garmentLastIndex}`
    : `Image #1`;

  const garmentLock = `# RULE #1 — GARMENT IS A 1:1 REPRODUCTION

${inputsExplained}

The garment in your output must look IDENTICAL to ${garmentRefShort} — as if you photographed the same physical garment in a new setting. You are a photographer, not a designer.${
    hasMultipleGarmentViews
      ? `\n\nThe multiple garment images (Images #1–#${garmentLastIndex}) all show the SAME ONE garment from different angles. Use them together as references. DO NOT mix them as if they were separate items. There is only one garment.`
      : ""
  }

Reproduce EXACTLY from ${garmentRefShort}:
- All colors on every panel (top, sleeves, body, skirt, hem, belt, trim). Same hue, same saturation, same zones.
- All patterns, embroidery, motifs, prints, borders. Do not add. Do not remove. Do not "complete".
- Length, cut, silhouette, neckline, sleeve shape, proportions.
- Fabric finish (matte / satin / velvet / sheer).
- Trims, belts, ties, buttons, embroidery placement.

NEVER:
- Recolor or tint the garment to match the scene.
- Add a color (navy, blue, gold, floral, paisley, etc.) that is not visible in the reference.
- Replace any panel with a different color or fabric.
- "Improve" or "enrich" the design — it is already finished.
- Change the length, cut, or proportions.

The scene exists only as a backdrop behind the model. It must not influence the garment in any way.${
  hasHouseModel
    ? `

# RULE #2 — WOMAN IS A 1:1 REPRODUCTION OF IMAGE #${houseModelIndex}

The woman in the output is the same person as in Image #${houseModelIndex} — same face, same skin tone, same hair (length, color, texture), same body build (full natural bust, soft curves, defined waist, NOT runway-thin), same apparent age (late 20s / early 30s). Even on back/profile shots, hair / skin / body must match Image #${houseModelIndex}. Do not generate a different woman.`
    : ""
}

# OUTPUT FRAMING — MANDATORY FULL-BODY
- Vertical 9:16 portrait (tall fashion editorial format).
- FULL-BODY shot. The frame MUST include the model from a small headroom above the head down to a small floor margin BELOW THE FEET. Both shoes / feet must be fully visible inside the frame.
- DO NOT crop at the waist, hips, thighs, knees, ankles or any point above the floor. If the feet are not visible, the framing is WRONG — re-frame and zoom out.
- IGNORE the framing of the garment reference images. They may be mid-shots, close-ups, hands holding the fabric, etc. — that is irrelevant. The OUTPUT framing is always full-body, never mid-shot, unless the pose is "detail_close".
- The entire garment, from collar to hem, plus the model's shoes / feet, must fit inside the frame with comfortable margin.${
  params.pose === "detail_close" ? `\n- EXCEPTION: this generation uses the detail_close pose, so a waist-up framing is allowed.` : ""
}`;

  const prompt = [
    garmentLock,
    `# SCENE (backdrop only — does NOT affect garment)\n${stylePrompt}`,
    `# POSE\n${posePrompt}`,
    compositionHint,
    params.extraInstructions ? `# ADDITIONAL\n${params.extraInstructions}` : null,
    `# FINAL CHECK BEFORE GENERATING
Compare your mental output to ${garmentRefShort} panel by panel:
- Same colors on every panel? (no scene tint, no added navy/blue/gold/floral)
- Same patterns and embroidery? (none added, none removed)
- Same length and cut?
- Same fabric finish?
If any difference exists, fix it. The garment must be a 1:1 reproduction of ${garmentRefShort}.`,
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
              { inlineData: { mimeType: params.mimeType, data: params.imageBase64 } },
              ...additionalImages.map((img) => ({
                inlineData: { mimeType: img.mimeType, data: img.base64 },
              })),
              ...(houseModel
                ? [{ inlineData: { mimeType: houseModel.mimeType, data: houseModel.data } }]
                : []),
              { text: prompt },
              { inlineData: { mimeType: params.mimeType, data: params.imageBase64 } },
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
- The tags array MUST include EACH color as a BILINGUAL PAIR (one EN tag + one AR tag) — e.g. for ${colorList.map((c) => `"${c.toLowerCase()}"`).join(", ")} emit both the English lowercase tag AND its Arabic translation tag (أخضر, أزرق, أحمر, etc.).
- Do NOT describe the photo's color as the only color of the product — make it clear other colors exist.
`
    : "";

  const forbiddenBlock = usedNames.length
    ? `\n\n⚠️ FORBIDDEN GIVEN NAMES — these are the FIRST WORDS already used on other products in the catalogue. The FIRST WORD of your chosen poetic name MUST NOT match any item in this list (case-insensitive). Pick a fresh first word that does not appear here:\n${usedNames.map((n) => `- ${n}`).join("\n")}\n\nExamples of how this rule applies:\n- If "Layla" is in the list: "Layla Daraa", "Layla Caftan", "Layla Heritage" are ALL forbidden — pick a different first word.\n- If "Noor" is in the list: do NOT start the name with "Noor".\nThis rule is non-negotiable. Re-read the list before writing the title.\n`
    : "";

  const prompt = `You write product copy for Atelier Blue Marine — a Kuwait luxury atelier of Gulf / Middle-Eastern heritage womenswear (daraa, caftan, bisht, layered sets, embroidered tunics, velvet bishts).${compositionBlock}${colorsBlock}${forbiddenBlock}

# SKU RULE — ABSOLUTE, READ FIRST
The product SKU is exactly: ${sku}
- Every "title" field (en.title, ar.title) MUST start with "${sku} – " (the SKU, then a space, an en-dash "–", and a space). Copy "${sku}" character-for-character.
- The "sku" field MUST be exactly "${sku}".
- The "urlHandle" field MUST start with "${sku.toLowerCase()}-".
- DO NOT invent or substitute any other code (no "ABM…", "BM…", "ATL…", no 3-letter prefixes, no different number). The SKU is "${sku}" and only "${sku}".
- "pageTitle" and "metaDescription" must NOT contain any SKU code.

# NAMING RULE — give the piece a UNIQUE KHALEEJI FEMININE NAME
Each product gets a single Khaleeji (Gulf) feminine first name as its identity, then the garment word. Like a Gulf fashion house giving each piece its own woman's name. Examples in the catalogue: "Hessa 3-Piece Bisht Set", "Lulwa 3-Piece Bisht Set", "Aljowhara 3-Piece Bisht Set", "Bashayer Daraa", "Mayasa Daraa", "Shouq Daraa".

⚠️ STRICT RULE — pick a KHALEEJI / GULF feminine name. NOT a pan-Arab generic name (avoid Mariam, Maryam, Sara, Aisha, Fatima, Yasmin — those feel Levantine/Egyptian, not Gulf). Distinctively Gulf names sound like the names of Kuwaiti, Saudi, Emirati, Qatari, Bahraini, or Omani women.

NAME INSPIRATION POOL — pick ONE Khaleeji feminine name that fits the garment's mood (color, embroidery, occasion). Each name has its Arabic transliteration (use it verbatim in the AR title):
- Royal / heritage feel (matches embellished sets, velvet, sequin, gold): Aljohara الجوهرة, Aljouri الجوري, Aljazi الجازي, Mahra مهرة, Khawla خولة, Lujain لجين, Aroob عروب, Banan بنان, Tareefa طريفة, Zhaira زهيرة, Sumayya سميّة
- Khaleeji classic (well-known Gulf feminine names): Maha مها, Hanan حنان, Najla نجلاء, Lamya لمياء, Wafa وفاء, Rawan روان, Manal منال, Suad سعاد, Suhayla سهيلة, Ghaliyah غالية, Hanaa هناء, Faten فاتن, Shaima شيماء, Marwa مروة, Nahed ناهد, Naila نائلة, Jameela جميلة, Wedad وداد, Bouthayna بثينة, Anwar أنوار, Watfa وطفاء
- Poetic / nature / soft (matches lighter daraas, floral, botanical prints): Bayan بيان, Yara يارا, Mira ميرا, Rahaf رهف, Rima ريما, Rasha رشا, Suha سها, Maya مايا, Layan ليان, Hadeel هديل, Hanin حنين, Reham رهام, Ibtisam ابتسام, Tahreer تحرير, Wajd وجد, Amani أماني, Inas إيناس, Lina لينا, Nada ندى, Ola علا
- Heritage / words (use sparingly, only when extremely fitting): Lu'lu لؤلؤة (pearl), Marjan مرجان (coral), Falaj فلج (oasis-stream), Khaleej خليج (gulf), Dana دانة (large pearl)

⚠️ DO NOT use the OLD model-line names — they are now retired or in use elsewhere: "Bahar", "Sahar", "Amira", "Yaqut", "Zumurud", "Layali", "Noor", "Layla", "Reem", "Bandar", "Zafira", "Amara", "Zaria", "Layal", "Yasmin", "Ghada", "Sultana". The runtime FORBIDDEN list above will also block any name already in the catalogue — re-read it before writing.

# GARMENT IDENTIFICATION — LOOK AT THE PHOTO FIRST
Before writing anything, identify the garment shown in the image. Pick ONE from this list based on what you actually see:
- **daraa (درّاعة)** — long, flowing one-piece Gulf gown, usually loose, often embroidered. Most common in this catalogue. If you see ONE flowing dress with no separate outer layer, it is a daraa.
- **caftan (قفطان)** — long robe with a front opening or buttons down the centre.
- **bisht (بشت)** — a sheer/embroidered OUTER cloak worn OVER an inner garment. Used as a standalone outer cloak OR as part of a 2-piece / 3-piece set with a daraa and matching shawl. DO NOT label a single flowing dress as a "bisht".
- **set / bisht-set** — for ANY 2-piece or 3-piece coordinated outfit (outer bisht + inner daraa, optionally a matching shawl). Multi-piece sets are ALWAYS bisht-sets — never call them an "abaya set".
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
  · Correct examples: "${sku} – Maha Daraa", "${sku} – Lujain Caftan", "${sku} – Khawla Bisht".
  · Wrong: "${sku} – Maha 2-Piece Bisht Set" (this product is ONE piece, not a set).`
  : `- ⚠️ PIECE COUNT — THIS PRODUCT HAS ${totalPieces} PIECES${hasShawl ? ` (${pieces} main piece${pieces > 1 ? "s" : ""} + matching shawl)` : ""}.
  · Write exactly "${pieceCountEn}" (hyphen, capital P, capital S) before the garment word.
  · Correct example: "${sku} – Aljohara ${pieceCountEn} Bisht Set".
  · NEVER use "Two-Piece" / "Three-Piece" — always digit + hyphen + "Piece".`}
- Color is OPTIONAL. The photo already shows the color, so you can omit it for a cleaner title — only include it when it is a defining trait (e.g. "Royal Navy", "Ivory") and helps SEO.
- Don't reuse a name that's already in the FORBIDDEN list above. Pick a name that fits THIS specific garment.
- Plain English. No marketing fluff. No "exquisite / captivating / stunning / regal / opulent".

# ARABIC TITLE RULES (ar.title)
- Format: "${sku} – الاسم بالعربية + وصف قصير"
- Use the SAME Khaleeji name as in English, written in Arabic script (use the Arabic spelling listed in the inspiration pool).
  · Examples: Maha → مها, Lujain → لجين, Khawla → خولة, Aljohara → الجوهرة, Hanin → حنين, Lina → لينا
- Then add the garment + key detail in formal but simple Arabic.
- Use Gulf vocabulary: بشت، درّاعة، قفطان، مخمل، حرير، مطرّز، طقم، ٢ قطع، ٣ قطع، تراثي، شال.
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
- "bisht Kuwait", "daraa Kuwait", "bisht women Kuwait", "luxury daraa Kuwait"
- "بشت الكويت", "درّاعة الكويت", "بشت نسائي الكويت", "أتيليه كويتي"
- "Gulf heritage clothing", "Khaleeji daraa", "bisht online Kuwait"
- Garment-specific: "velvet bisht", "embroidered daraa", "wedding bisht", "bisht set"
SEO RULES:
- Page title MUST include: garment type (bisht/daraa/caftan) + 1 distinctive trait + brand name. Front-load keywords: garment type comes first, brand last. (50-70 chars).
- Page title (AR) mirrors the EN structure with "أتيليه بلو مارين" at the end.
- Page title NEVER contains the SKU prefix.
- Meta description MUST include: garment type, color/material, occasion (general), AND the word "Kuwait" or "Atelier Blue Marine" once.
- Tags must be FULLY BILINGUAL (English + Arabic) for garment type, color, fabric and occasion. Duplicate keys help GCC shoppers find products in either language (e.g. "bisht" AND "بشت"; "green" AND "أخضر"; "velvet" AND "مخمل"; "wedding" AND "زفاف").
- Description (body_html) MUST mention: garment type by name (bisht/daraa/caftan), fabric, occasion, and where appropriate "Kuwait" or "Gulf heritage" (once, naturally).
- Use the SKU's poetic name as the brand-distinctive token (Yaqut, Layali, Zumurud, etc.) — this is the canonical product name on Google. Include it in the page title as the distinctive trait when natural.

# DESCRIPTION STRUCTURE — 3 paragraphs, separated by \\n\\n

PARAGRAPH 1 — what it is. Garment type + main visual fact (color, fabric).
PARAGRAPH 2 — one specific detail that matters (embroidery placement, cut, layering, sleeve, set composition).
PARAGRAPH 3 — when to wear it (1 short sentence) + a separate sentence about fabric/feel.

# TAGS — 16-22 BILINGUAL Shopify tags optimized for GCC search (English + Arabic)
Atelier Blue Marine ships across Kuwait, Saudi, UAE, Qatar, Bahrain, Oman — Arabic shoppers must find products by typing Arabic. Every garment-type, color, fabric and occasion tag MUST be emitted as a bilingual PAIR (one EN tag + one AR tag).

Required mix (PAIRS unless noted):
- garment type — EN + AR pair: {bisht/بشت, daraa/درّاعة, caftan/قفطان, set/طقم, bisht-set/طقم-بشت, daraa-set/طقم-درّاعة}
- color (1-2 dominant) — EN + AR pair per color: {green/أخضر, emerald/زمرّدي, burgundy/عنابي, navy/كحلي, ivory/عاجي, gold/ذهبي, silver/فضي, black/أسود, white/أبيض, blue/أزرق, red/أحمر, purple/بنفسجي, pink/وردي, beige/بيج, olive/زيتي, brown/بني}
- fabric — EN + AR pair: {velvet/مخمل, silk/حرير, chiffon/شيفون, embroidered/مطرّز, brocade/بروكار, satin/ساتان, lace/دانتيل, cotton/قطن}
- occasion (NO ramadan unless capsule) — EN + AR pair: {evening/سهرة, wedding/زفاف, henna/حناء, eid/عيد, gathering/تجمع, formal/رسمي, special-occasion/مناسبة-خاصة}
- style — EN only (these are already brand-recognized in EN by GCC shoppers): {heritage, gulf, khaleeji, kuwait, luxury, traditional}
- ALWAYS include 1 transliteration/locale tag like "kuwait" or "khaleeji".

Format rules:
- Lowercase. Single-word or short hyphenated. No "#", no commas inside tags.
- Arabic tags use Arabic script (no transliteration). Hyphenate AR multi-word tags exactly like the EN counterpart (e.g. "special-occasion" → "مناسبة-خاصة").
- Output as a flat array. Order: garment(EN+AR), color(EN+AR), fabric(EN+AR), occasion(EN+AR), style(EN).

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
1. Did you label a single flowing dress as "Bisht" or "Bisht Set"? If yes, REWRITE — it is a daraa or caftan.
${totalPieces === 1
  ? `2. Does any title contain "2-Piece", "3-Piece", "Set", "Bisht Set", "طقم", "٢ قطع", or "٣ قطع"? This product has ONE piece — REMOVE all count/set words and rewrite the title.`
  : `2. Does the EN title contain "${pieceCountEn}" and the AR title contain "${pieceCountAr}"? If not, REWRITE.`}
3. Did you use any banned word (exquisite, captivating, evoking, celebration of, Ramadan unless capsule, فستان, abaya, عباية)? DELETE the sentence and rewrite factually.
4. Did you write "Two-Piece" or "Three-Piece" instead of "2-Piece" / "3-Piece"? REWRITE.`;

  const callModel = (model: string, extraDirective: string) =>
    ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt + extraDirective },
            { inlineData: { mimeType: params.mimeType, data: params.imageBase64 } },
          ],
        },
      ],
      config: { responseMimeType: "application/json" },
    });

  const runOnce = async (extraDirective: string): Promise<ProductDescription> => {
    let response;
    try {
      response = await withRetry(() => callModel(TEXT_MODEL, extraDirective), "description");
    } catch (err) {
      console.warn(
        `[gemini:description] primary model failed, trying fallback ${TEXT_MODEL_FALLBACK} — ${err instanceof Error ? err.message.slice(0, 120) : ""}`,
      );
      response = await withRetry(
        () => callModel(TEXT_MODEL_FALLBACK, extraDirective),
        "description-fallback",
      );
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
  };

  let parsed = await runOnce("");
  const collision = findGivenNameCollision(parsed.en?.title ?? "", usedNames);
  if (collision) {
    console.warn(
      `[gemini:description] Gemini reused forbidden given name "${collision}". Retrying with stricter directive.`,
    );
    const retryDirective = `\n\n# RETRY — YOUR PREVIOUS ATTEMPT VIOLATED THE RULE\nYour previous response started the poetic name with "${collision}", which is in the FORBIDDEN GIVEN NAMES list above. That is a critical failure. Choose a COMPLETELY DIFFERENT first word that is NOT in the forbidden list. Do NOT use "${collision}" anywhere in the title. Pick another name from the inspiration pool.`;
    parsed = await runOnce(retryDirective);
  }
  return parsed;
}

export function extractGivenName(title: string): string | null {
  const m = title.match(/^[A-Z]\d{1,4}\s*[–\-]\s*([A-Za-z][\w']*)/);
  return m ? m[1] : null;
}

function findGivenNameCollision(title: string, usedNames: string[]): string | null {
  const given = extractGivenName(title);
  if (!given) return null;
  const lowered = given.toLowerCase();
  const hit = usedNames.find((n) => n.toLowerCase() === lowered);
  return hit ?? null;
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

  const prompt = `You are the brand voice of Atelier Blue Marine — a Kuwait luxury atelier crafting Moroccan and Middle-Eastern heritage womenswear (caftans, daraa, bishts, embroidered tunics).

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
      "hashtags": ["array of 15 hashtags. Mix: 5 brand+product (#BlueMarine #AtelierBlueMarine #Caftan #Bisht #ModestFashion), 5 Gulf market (#Q8 #Q8Style #KuwaitFashion #GCCFashion #Khaleeji #DubaiFashion), 5 niche (#LuxuryBisht #HandEmbroidery #SilkVelvet #EidOutfit #BishtSet). Pick the 15 most relevant to THIS product. No # spaces, no duplicates."]
    },
    "ar": {
      "caption": "نفس البنية بالعربية الفصحى البسيطة، ٣-٤ أسطر قصيرة، إيموجي ١-٢ كحد أقصى، دعوة للحجز في النهاية. ٢٨٠ حرف كحد أقصى.",
      "hashtags": ["15 Arabic + Gulf hashtags mixed: #الكويت #اطلالات_الكويت #بشت #قفطان #درّاعة #ازياء_خليجية #العيد + relevant brand/product tags. Pick the 15 most relevant."]
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

