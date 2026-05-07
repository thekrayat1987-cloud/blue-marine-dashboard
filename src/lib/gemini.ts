import { GoogleGenAI, Modality } from "@google/genai";

const MODEL = "gemini-2.5-flash-image";

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
    "Pose: tall elegant female model, perfect frontal pose facing the camera, statuesque posture, arms relaxed beside the body, neutral confident expression. Full-body framing, centered composition, vertical 2:3 portrait aspect (taller than wide).",
  three_quarter:
    "Pose: tall elegant female model in a refined three-quarter angle (body turned ~30-40° from camera), one foot slightly forward, weight on the back leg for an elongated silhouette, hand resting gently at the waist or letting fabric fall, soft confident gaze toward the camera. Full-body framing, vertical 2:3 portrait aspect (taller than wide).",
  profile:
    "Pose: tall elegant female model in a clean side profile (90°), chin slightly lifted, arms relaxed, posture statuesque to showcase the garment's silhouette and side embroidery. Full-body framing, vertical 2:3 portrait composition (taller than wide).",
  back:
    "Pose: tall elegant female model photographed from behind, head turned slightly to reveal jawline, showcasing the back of the garment (neckline, embroidery, drape). Full-body framing, vertical 2:3 portrait composition (taller than wide).",
  walking:
    "Pose: tall elegant female model captured mid-walk with natural movement, fabric flowing softly, one foot forward, slight side angle, candid look off-camera. Full-body framing, dynamic but graceful, vertical 2:3 portrait composition (taller than wide).",
  seated:
    "Pose: tall elegant female model seated on a low ottoman or marble bench, fabric arranged elegantly around her, legs crossed at the ankle, hands resting in lap, refined posture, soft direct gaze. Full-body framing, vertical 2:3 portrait composition (taller than wide).",
  looking_back:
    "Pose: tall elegant female model with body turned three-quarters away from camera, head turned back over the shoulder with a soft refined gaze, showcasing both the side of the garment and the back drape. Full-body framing, vertical 2:3 portrait composition (taller than wide).",
  detail_close:
    "Framing: medium close-up shot from waist up, subtle three-quarter angle, focused on the embroidery, neckline and fabric details of the garment. Hands gently touching the fabric or holding the side. Soft, flattering light on the textile. Vertical 2:3 portrait composition (taller than wide).",
  low_angle:
    "Pose: tall elegant female model shot from a slight low angle for a regal, statuesque effect, elongating the silhouette. Subtle three-quarter pose, chin lifted, confident neutral expression. Full-body framing, vertical 2:3 portrait composition (taller than wide).",
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

  const garmentLock = `# GARMENT FIDELITY — HIGHEST PRIORITY (read before anything else)

The source image shows ONE specific garment. Your job is to put THAT garment, unchanged, on a model. Treat the garment like a real physical object you must reproduce 1:1.

You MUST copy from the source, exactly:
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

# OUTPUT FRAMING — MANDATORY
- Aspect ratio: vertical 2:3 portrait (width:height = 2:3, i.e. the image is taller than it is wide).
- Composition: full-body model centered horizontally, with comfortable headroom above the hair and clear space below the feet so the image can be cropped safely on any e-commerce grid.
- All generated images for Blue Marine MUST share this exact 2:3 portrait ratio so the catalog is visually uniform.`;

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
}): Promise<ProductDescription> {
  const ai = getClient();
  const sku = params.sku?.trim() || "AXXX";
  const pieces = params.pieces ?? 1;
  const hasShawl = params.hasShawl ?? false;

  const compositionFacts: string[] = [];
  if (pieces > 1) compositionFacts.push(`${pieces}-piece coordinated set (ensemble ${pieces} pièces)`);
  if (hasShawl) compositionFacts.push("includes a matching shawl");
  const compositionBlock = compositionFacts.length
    ? `\n\n# COMPOSITION (must be reflected in title, description and tags)\nThis product is: ${compositionFacts.join(", ")}.\n- Mention the piece count explicitly in the description (e.g. "a two-piece set", "ensemble trois pièces"... in the appropriate language).\n- If a shawl is included, mention it as a matching shawl / châle assorti / شال مطابق.\n- Add relevant tags such as "${pieces}-piece", "set"${hasShawl ? ', "shawl"' : ""}.\n`
    : "";

  const prompt = `You write product copy for Atelier Blue Marine — a Kuwait atelier making Moroccan / Middle-Eastern heritage womenswear (daraa / dra'a, caftans, abayas, layered sets, embroidered tunics).${compositionBlock}

# WRITING RULES — read carefully, follow strictly

1. Plain, natural English. Short sentences (max ~15 words). Read it aloud — if it sounds like a perfume ad, rewrite.
2. Concrete details over poetry. Say "olive silk velvet, gold thread embroidery on the neckline" — not "captivating olive hue evoking timeless elegance".
3. No filler adjectives stacked together. Pick ONE adjective max per noun.
4. Active voice. Specific verbs. Avoid "evokes / evoking", "embraces", "celebrates", "captures the essence of".
5. Total length: 60-90 words across 3 short paragraphs. Each paragraph: 1-2 sentences only.
6. Banned words / phrases — DO NOT USE any of these:
   exquisite, captivating, captivate, evoke, evokes, evoking, evocative, allure, alluring, mystique, embrace, embraces, journey, celebration of, statement piece, must-have, sophisticated allure, enchanting, mesmerizing, breathtaking, stunning, gorgeous, lovely, dreamy, ethereal, gracefully, exquisitely, beautifully, masterfully, intricate (overused), cascade, cascading, adorned, adorning, luminous, radiant, opulent, lavish, regal, majestic.

# STRUCTURE — 3 paragraphs, separated by \\n\\n

PARAGRAPH 1 — what it is. Garment type + main visual fact (color, fabric).
PARAGRAPH 2 — one specific detail that matters (embroidery placement, cut, layering, sleeve shape).
PARAGRAPH 3 — when to wear it (1 short sentence). Then a separate sentence about fabric/feel.

# REFERENCE — your output must read like this (style, length, tone)

TITLE: "${sku} – Olive Embroidered Caftan"

DESCRIPTION:
A flowing caftan in olive silk velvet, with a soft sheen that shifts in the light.

Hand-embroidered motifs trace the neckline, sleeves and hem in golden thread.

Wear it for gatherings, dinners or evenings at home. The fabric is light and breathes well.

PAGE TITLE: "Olive Embroidered Caftan – Silk Velvet"
META DESCRIPTION: "Olive silk velvet caftan with hand-embroidered neckline and sleeves. Light, flowing, made for gatherings and quiet evenings."

# OUTPUT

Return ONLY valid JSON (no backticks, no markdown):
{
  "sku": "${sku}",
  "urlHandle": "${sku.toLowerCase()}-short-slug-from-product-name",
  "en": {
    "title": "${sku} – Short Product Name (3-5 words)",
    "description": "3 short paragraphs separated by \\n\\n, following the rules above. 60-90 words total. NO banned words.",
    "pageTitle": "50-70 chars, with – separator, no SKU",
    "metaDescription": "130-160 chars, plain and direct"
  },
  "ar": {
    "title": "${sku} – اسم المنتج بالعربية (٣-٥ كلمات)",
    "description": "ثلاث فقرات قصيرة مفصولة بـ \\n\\n، بأسلوب طبيعي وبسيط. ٦٠-٩٠ كلمة إجماليًا. جمل قصيرة وواضحة. لا تستخدم كلمات مكررة أو زخرفة لغوية مفرطة.",
    "pageTitle": "عنوان SEO ٥٠-٧٠ حرفاً مع فاصل –",
    "metaDescription": "وصف ميتا ١٣٠-١٦٠ حرفاً، مباشر وبسيط"
  },
  "tags": ["10 lowercase Shopify tags: garment type, color, fabric, occasion, style"]
}

# ARABIC RULES (same spirit)
- لغة فصحى بسيطة، جمل قصيرة، تفاصيل محسوسة (لون، قماش، تطريز).
- ابتعد عن الصياغات المنمقة والكلمات المكررة.
- ٣ فقرات قصيرة فقط، جملة أو جملتين لكل فقرة.

CRITICAL: If you find yourself writing "exquisite", "captivating", "evoking", "celebration of", or any banned word — DELETE the sentence and rewrite it factually.`;

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
    fr: { caption: string; hashtags: string[] };
    ar: { caption: string; hashtags: string[] };
  };
  whatsapp: {
    fr: string;
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
    "fr": {
      "caption": "3-4 short lines in French. Hook on line 1 (one sensory detail or question). Body: 1-2 lines describing the piece (color, fabric, occasion). Soft CTA on last line (e.g. 'Lien en bio' or 'DM pour commander'). 1-2 tasteful emojis MAX. Max 280 chars.",
      "hashtags": ["array of 15 hashtags. Mix: 5 brand+product (#BlueMarine #AtelierBlueMarine #Caftan #Abaya #ModestFashion), 5 Gulf market (#Q8 #Q8Style #KuwaitFashion #GCCFashion #Khaleeji #DubaiFashion), 5 niche (#LuxuryAbaya #HandEmbroidery #SilkVelvet #EidOutfit #RamadanStyle). Pick the 15 most relevant to THIS product. No # spaces, no duplicates."]
    },
    "ar": {
      "caption": "نفس البنية بالعربية الفصحى البسيطة، ٣-٤ أسطر قصيرة، إيموجي ١-٢ كحد أقصى، دعوة للحجز في النهاية. ٢٨٠ حرف كحد أقصى.",
      "hashtags": ["15 Arabic + Gulf hashtags mixed: #الكويت #اطلالات_الكويت #عبايات #قفطان #ازياء_خليجية #رمضان #العيد + relevant brand/product tags. Pick the 15 most relevant."]
    }
  },
  "whatsapp": {
    "fr": "Short WhatsApp Broadcast message in French. Format: 1 emoji + product hook (1 line) + 2-3 lines describing the piece + price/availability hint + 'Lien : ${productUrl}' + warm closing line. Use line breaks (\\n). Max 400 chars. Tone: like a personal message from a Kuwaiti boutique owner to a client.",
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

export type PriceEstimate = {
  lowKD: number;
  midKD: number;
  highKD: number;
  recommendedKD: number;
  reasoning: string;
  positioning: string;
  comparables: string[];
};

export async function estimateKuwaitPrice(params: {
  imageBase64: string;
  mimeType: string;
  productTitle: string;
  productDescription: string;
}): Promise<PriceEstimate> {
  const ai = getClient();

  const prompt = `You advise a luxury Kuwait atelier ("Atelier Blue Marine") on retail pricing in Kuwaiti Dinar (KD). The atelier sells Moroccan / Middle-Eastern heritage womenswear: caftans, daraa, abayas, embroidered tunics, layered sets.

# YOUR TASK
Look at the attached product image and the description. Estimate a fair retail price range for the Kuwait luxury fashion market.

Product title: ${params.productTitle}
Product description: ${params.productDescription}

# KUWAIT MARKET REFERENCE (your knowledge baseline — adjust based on what you actually see)
- Custom-made abaya (plain, good fabric): 40-120 KD
- Custom abaya with light embroidery / detail: 80-200 KD
- Caftan / daraa, fine fabric, hand embroidery: 150-500 KD
- Heavily embroidered evening / wedding piece, premium fabric (silk velvet, organza, hand work): 400-1500 KD+
- Fast-fashion abayas (Mango, H&M Modest): 15-40 KD (NOT the comparable market)
- Boutique luxury Gulf brands (Bouguessa, Mauzan, ABAYAH by Marwa, Reemami): 200-800 KD typical

Atelier Blue Marine positions in the upper-mid to high-end segment — premium materials, hand work, made in Kuwait.

# OUTPUT — return ONLY valid JSON (no backticks, no markdown):

{
  "lowKD": <integer — entry price someone might pay>,
  "midKD": <integer — most likely fair price>,
  "highKD": <integer — top of range a willing luxury client would pay>,
  "recommendedKD": <integer — your single recommended retail price (usually = midKD or slightly above)>,
  "reasoning": "2-3 sentences in French explaining WHY this price range, citing what you see in the image (fabric type, embroidery, complexity, finishings).",
  "positioning": "1 short sentence in French — how to position this product (e.g. 'Pièce d'occasion pour soirée — clientes 30-50 ans avec budget 200-400 KD').",
  "comparables": ["3 short bullet strings in French naming comparable Gulf/Kuwait brands or product categories that justify the price"]
}

# RULES
- Be realistic, not optimistic. Better to under-price slightly than over-price for an emerging atelier.
- Round prices to nearest 5 KD (e.g. 145, 165, 220 — not 147 or 163).
- Use the actual product image to refine your estimate. Look at: fabric weight/sheen, embroidery density, complexity of cut, finishing quality.
- French in reasoning/positioning, simple and direct, no marketing fluff.`;

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
    response = await withRetry(() => callModel(TEXT_MODEL), "price-estimate");
  } catch (err) {
    console.warn(
      `[gemini:price-estimate] primary model failed, trying fallback ${TEXT_MODEL_FALLBACK} — ${err instanceof Error ? err.message.slice(0, 120) : ""}`,
    );
    response = await withRetry(() => callModel(TEXT_MODEL_FALLBACK), "price-estimate-fallback");
  }

  const text = response.text;
  if (!text) {
    throw new Error("Gemini did not return text for price estimate");
  }

  try {
    return JSON.parse(text) as PriceEstimate;
  } catch {
    throw new Error("Failed to parse price estimate JSON");
  }
}
