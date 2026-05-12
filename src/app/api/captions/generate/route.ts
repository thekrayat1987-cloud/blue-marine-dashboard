import { NextRequest } from "next/server";
import {
  generateCaptions,
  type Framework,
  type Language,
  type Objective,
  type Platform,
  type Tone,
} from "@/lib/anthropic";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES = 5;

const ALLOWED_PLATFORMS = new Set<Platform>(["instagram", "tiktok"]);
const ALLOWED_LANGUAGES = new Set<Language>(["ar", "fr", "en"]);
const ALLOWED_FRAMEWORKS = new Set<Framework | "AUTO">([
  "AIDA",
  "PAS",
  "STORYTELLING",
  "CURIOSITY_GAP",
  "AUTO",
]);
const ALLOWED_TONES = new Set<Tone>([
  "luxe_discret",
  "emotionnel",
  "playful",
  "autorite",
  "storytelling",
]);
const ALLOWED_OBJECTIVES = new Set<Objective>([
  "vente_directe",
  "engagement",
  "awareness",
  "dm_whatsapp",
]);
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData
      .getAll("images")
      .filter((v): v is File => v instanceof File);

    if (files.length === 0) {
      return Response.json({ error: "Aucune image fournie" }, { status: 400 });
    }
    if (files.length > MAX_IMAGES) {
      return Response.json(
        { error: `Maximum ${MAX_IMAGES} images` },
        { status: 400 },
      );
    }
    for (const f of files) {
      if (f.size > MAX_BYTES) {
        return Response.json(
          { error: "Image trop volumineuse (max 8 Mo)" },
          { status: 400 },
        );
      }
      if (!ALLOWED_MIME.has(f.type)) {
        return Response.json(
          { error: `Format non supporté (${f.type})` },
          { status: 400 },
        );
      }
    }

    const keywords = String(formData.get("keywords") ?? "").trim();
    if (!keywords) {
      return Response.json(
        { error: "Mots-clés requis" },
        { status: 400 },
      );
    }
    const occasion = String(formData.get("occasion") ?? "").trim() || undefined;

    const platforms = parseList(formData, "platforms", ALLOWED_PLATFORMS) as Platform[];
    const languages = parseList(formData, "languages", ALLOWED_LANGUAGES) as Language[];
    if (platforms.length === 0) {
      return Response.json(
        { error: "Sélectionne au moins une plateforme" },
        { status: 400 },
      );
    }
    if (languages.length === 0) {
      return Response.json(
        { error: "Sélectionne au moins une langue" },
        { status: 400 },
      );
    }

    const toneRaw = String(formData.get("tone") ?? "luxe_discret");
    const tone = (ALLOWED_TONES.has(toneRaw as Tone) ? toneRaw : "luxe_discret") as Tone;
    const objectiveRaw = String(formData.get("objective") ?? "dm_whatsapp");
    const objective = (ALLOWED_OBJECTIVES.has(objectiveRaw as Objective)
      ? objectiveRaw
      : "dm_whatsapp") as Objective;
    const frameworkRaw = String(formData.get("framework") ?? "AUTO");
    const framework = (ALLOWED_FRAMEWORKS.has(frameworkRaw as Framework | "AUTO")
      ? frameworkRaw
      : "AUTO") as Framework | "AUTO";

    const regenerateNote =
      String(formData.get("regenerateNote") ?? "").trim() || undefined;

    const productInfoRaw = String(formData.get("productInfo") ?? "");
    let productInfo: {
      title?: string;
      sku?: string;
      priceKd?: number;
      url?: string;
      colors?: string[];
    } | undefined;
    if (productInfoRaw) {
      try {
        productInfo = JSON.parse(productInfoRaw);
      } catch {
        // ignore
      }
    }

    const images = await Promise.all(
      files.map(async (f) => ({
        base64: Buffer.from(await f.arrayBuffer()).toString("base64"),
        mimeType: f.type,
      })),
    );

    const result = await generateCaptions({
      images,
      keywords,
      occasion,
      platforms,
      languages,
      tone,
      objective,
      framework,
      productInfo,
      regenerateNote,
    });

    // Persist to history (best-effort, don't block response)
    try {
      await supabase.from("captions_history").insert({
        keywords,
        occasion: occasion ?? null,
        platforms,
        languages,
        tone,
        objective,
        framework,
        product_info: productInfo ?? null,
        variants: result.variants,
        input_tokens: result.raw_usage.input_tokens,
        output_tokens: result.raw_usage.output_tokens,
        image_count: images.length,
      });
    } catch (err) {
      console.warn("Failed to persist captions history:", err);
    }

    return Response.json({ variants: result.variants, usage: result.raw_usage });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}

function parseList(
  formData: FormData,
  key: string,
  allowed: Set<string>,
): string[] {
  const seen = new Set<string>();
  for (const v of formData.getAll(key)) {
    if (typeof v === "string" && allowed.has(v)) seen.add(v);
  }
  return Array.from(seen);
}
