import { GoogleGenAI, Modality } from "@google/genai";
import sharp from "sharp";

const TEXT_MODEL = "gemini-2.5-flash";
const IMAGE_MODEL = "gemini-2.5-flash-image";

let cachedClient: GoogleGenAI | null = null;
function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  if (!cachedClient) cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, label: string, retries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = e instanceof Error ? e.message : String(e);
      const retryable = /503|UNAVAILABLE|429|RESOURCE_EXHAUSTED|500|INTERNAL|overloaded|rate.?limit|timed?\s?out/i.test(msg);
      if (!retryable || i === retries) throw e;
      const delay = Math.min(1000 * Math.pow(2, i), 8000);
      console.warn(`[collection-creator:${label}] retry ${i + 1}/${retries} after ${delay}ms`);
      await sleep(delay);
    }
  }
  throw last;
}

export interface CollectionNameProposal {
  enName: string;
  arName: string;
  rationale: string;
}

const BRAND_VOICE = `Atelier Blue Marine — luxury Khaleeji womenswear brand based in Kuwait, shipping across the GCC.
Voice: refined, modern, heritage-luxury, feminine, never overdone.
Avoid: the word "abaya" (use "bisht" / "daraa" / "caftan" / "set" instead). The Arabic word "إطلالة" / "لإطلالة" / "اطلالات" is BANNED — never use it. Avoid "Ramadan-only" framing — products are year-round (wedding, evening, henna, gathering, eid).
Use Gulf garment vocab: بشت (not معطف), درّاعة (not فستان), قفطان, طقم, مخمل, مطرّز, تراثي.`;

export async function suggestCollectionNames(params: {
  theme: string;
  referenceImageBase64?: string;
  referenceImageMime?: string;
}): Promise<CollectionNameProposal[]> {
  const ai = getClient();
  const prompt = `${BRAND_VOICE}

You are naming a new Shopify collection for the brand. The user's theme/idea is:

"${params.theme}"

Propose exactly 3 short, modern, single-word (or two-word max) collection names.

Naming rules:
- No "Collection" suffix
- One word ideally; max two
- Each name must work in both English (Latin script) and Arabic (with translation)
- Prefer Gulf-rooted names (places, heritage words, common Khaleeji feminine names) over generic terms
- Each name should evoke something concrete tied to the theme

Return ONLY JSON in this exact shape (no markdown, no extra text):
{
  "proposals": [
    { "enName": "<English name>", "arName": "<Arabic translation>", "rationale": "<one sentence why it fits>" }
  ]
}`;

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{ text: prompt }];
  if (params.referenceImageBase64 && params.referenceImageMime) {
    parts.push({ inlineData: { mimeType: params.referenceImageMime, data: params.referenceImageBase64 } });
  }

  const res = await withRetry(
    () =>
      ai.models.generateContent({
        model: TEXT_MODEL,
        contents: [{ role: "user", parts }],
        config: { responseMimeType: "application/json" },
      }),
    "names",
  );

  const text = res.text || "";
  const parsed = JSON.parse(text) as { proposals?: CollectionNameProposal[] };
  if (!Array.isArray(parsed.proposals) || parsed.proposals.length === 0) {
    throw new Error("AI returned no proposals");
  }
  return parsed.proposals.slice(0, 3);
}

export interface CollectionContent {
  bodyHtmlEn: string;
  bodyHtmlAr: string;
  seoTitleEn: string;
  seoTitleAr: string;
  seoDescEn: string;
  seoDescAr: string;
}

export async function suggestCollectionContent(params: {
  enName: string;
  arName: string;
  theme: string;
}): Promise<CollectionContent> {
  const ai = getClient();
  const prompt = `${BRAND_VOICE}

You are writing the description and SEO copy for a new collection.

Collection name (EN): ${params.enName}
Collection name (AR): ${params.arName}
Theme/idea given by the brand owner: "${params.theme}"

Write:
1. Description body in English (1-2 short sentences, wrapped in <p>...</p>)
2. Description body in Arabic (1-2 short sentences, wrapped in <p>...</p>) — Khaleeji vocab, no "إطلالة"
3. SEO meta title in English (under 70 chars, includes the collection name + Atelier Blue Marine)
4. SEO meta title in Arabic (under 70 chars, includes the AR name + أتيليه بلو مارين)
5. SEO meta description in English (under 160 chars)
6. SEO meta description in Arabic (under 160 chars)

Return ONLY JSON:
{
  "bodyHtmlEn": "...",
  "bodyHtmlAr": "...",
  "seoTitleEn": "...",
  "seoTitleAr": "...",
  "seoDescEn": "...",
  "seoDescAr": "..."
}`;

  const res = await withRetry(
    () =>
      ai.models.generateContent({
        model: TEXT_MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" },
      }),
    "content",
  );
  const parsed = JSON.parse(res.text || "{}") as Partial<CollectionContent>;
  for (const key of ["bodyHtmlEn", "bodyHtmlAr", "seoTitleEn", "seoTitleAr", "seoDescEn", "seoDescAr"] as const) {
    if (!parsed[key] || typeof parsed[key] !== "string") {
      throw new Error(`AI response missing field: ${key}`);
    }
  }
  // Sanity scrub for the banned word
  for (const key of ["bodyHtmlAr", "seoTitleAr", "seoDescAr"] as const) {
    parsed[key] = parsed[key]!.replace(/إطلالة|لإطلالة|اطلالات|إطلالات/g, "تصميم");
  }
  return parsed as CollectionContent;
}

export async function generateCollectionCover(params: {
  enName: string;
  theme: string;
  vibePrompt?: string;
}): Promise<Buffer> {
  const ai = getClient();
  const prompt = `# TASK
Generate a luxury fashion editorial cover image for a Khaleeji collection called "${params.enName}".
The collection theme is: "${params.theme}".
${params.vibePrompt ? `Additional creative direction: ${params.vibePrompt}` : ""}

# SUBJECT
A single elegant Gulf woman, late 20s, olive Mediterranean skin tone, dark hair, calm confident gaze. Modest, fully covered, refined Khaleeji styling. She wears a flowing piece appropriate to the collection theme. The garment is the focal point.

# SETTING + MOOD
Setting that fits the collection theme. Editorial fashion photography, not lifestyle snapshot. Quiet luxury, warm tones, soft natural light. Cinematic high-end lookbook quality.

# COMPOSITION
Vertical 9:16 portrait. Full-body or three-quarter framing. Soft natural light. Shallow depth of field if applicable.

# CRITICAL
- Single woman only, alone in frame.
- No text, no logos, no watermarks, no captions.
- Modest, fully covered, dignified.
- Vertical 9:16 aspect ratio.`;

  const res = await withRetry(
    () =>
      ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { responseModalities: [Modality.IMAGE] },
      }),
    "cover",
  );
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData?.data);
  if (!img?.inlineData?.data) {
    const txt = parts.find((p) => p.text)?.text ?? "no image returned";
    throw new Error(txt.slice(0, 200));
  }
  const raw = Buffer.from(img.inlineData.data, "base64");
  return sharp(raw)
    .resize(864, 1536, { fit: "cover", position: "centre" })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}
