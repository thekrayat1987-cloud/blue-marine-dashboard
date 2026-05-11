import { NextRequest } from "next/server";
import {
  generateBlueMarineImage,
  generateProductDescription,
  type StylePreset,
  type PosePreset,
} from "@/lib/gemini";
import { generateBlueMarineImageOpenAI } from "@/lib/openai";
import { getUsedPoeticNames } from "@/lib/shopify";
import { saveGeneration } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 120;

type ImageProvider = "gemini" | "openai";

const ALLOWED_PRESETS: StylePreset[] = ["studio", "lookbook", "lifestyle", "riad", "palais", "desert"];
const ALLOWED_POSES: PosePreset[] = [
  "front",
  "three_quarter",
  "profile",
  "back",
  "walking",
  "seated",
  "looking_back",
  "detail_close",
  "low_angle",
];
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const filesMulti = formData.getAll("images").filter((v): v is File => v instanceof File);
    const fileSingle = formData.get("image");
    const files: File[] =
      filesMulti.length > 0
        ? filesMulti
        : fileSingle instanceof File
          ? [fileSingle]
          : [];
    const presetRaw = formData.get("preset");
    const poseRaw = formData.get("pose");
    const extra = formData.get("extra");
    const skuRaw = formData.get("sku");
    const piecesRaw = formData.get("pieces");
    const hasShawl = formData.get("hasShawl") === "true";
    const skipDescription = formData.get("skipDescription") === "true";
    const skipImage = formData.get("skipImage") === "true";
    const providerRaw = formData.get("provider");
    const provider: ImageProvider =
      providerRaw === "openai" ? "openai" : "gemini";
    const sku = typeof skuRaw === "string" ? skuRaw.trim() : "";
    const piecesParsed = typeof piecesRaw === "string" ? parseInt(piecesRaw, 10) : 1;
    const pieces = ([1, 2, 3, 4].includes(piecesParsed) ? piecesParsed : 1) as 1 | 2 | 3 | 4;

    if (files.length === 0) {
      return Response.json({ error: "Aucune image fournie" }, { status: 400 });
    }
    if (files.length > 4) {
      return Response.json({ error: "Maximum 4 images du vêtement" }, { status: 400 });
    }
    for (const f of files) {
      if (f.size > MAX_BYTES) {
        return Response.json({ error: "Image trop volumineuse (max 8 Mo)" }, { status: 400 });
      }
    }
    const preset = ALLOWED_PRESETS.includes(presetRaw as StylePreset)
      ? (presetRaw as StylePreset)
      : "studio";
    const pose = ALLOWED_POSES.includes(poseRaw as PosePreset)
      ? (poseRaw as PosePreset)
      : "three_quarter";

    const garmentImages = await Promise.all(
      files.map(async (f) => ({
        base64: Buffer.from(await f.arrayBuffer()).toString("base64"),
        mimeType: f.type || "image/jpeg",
      })),
    );
    const imageBase64 = garmentImages[0].base64;
    const mimeType = garmentImages[0].mimeType;
    const additionalImages = garmentImages.slice(1);
    const extraStr = typeof extra === "string" ? extra : "";

    const wantDescription = skipImage ? true : !skipDescription;

    let usedNames: string[] = [];
    if (wantDescription) {
      try {
        usedNames = await getUsedPoeticNames();
      } catch (err) {
        console.warn("Failed to fetch used poetic names from Shopify:", err);
      }
    }

    const generateImageFn =
      provider === "openai" ? generateBlueMarineImageOpenAI : generateBlueMarineImage;
    const imagePromise = skipImage
      ? Promise.resolve(null)
      : generateImageFn({
          imageBase64,
          mimeType,
          preset,
          pose,
          pieces,
          hasShawl,
          extraInstructions: extraStr.trim() ? extraStr.trim() : undefined,
          additionalImages,
        });

    const [imageResult, descriptionResult] = await Promise.allSettled([
      imagePromise,
      wantDescription
        ? generateProductDescription({
            imageBase64,
            mimeType,
            sku: sku || undefined,
            pieces,
            hasShawl,
            usedNames,
            extraInstructions: extraStr.trim() ? extraStr.trim() : undefined,
          })
        : Promise.resolve(null),
    ]);

    if (!skipImage && imageResult.status === "rejected") {
      const message =
        imageResult.reason instanceof Error
          ? imageResult.reason.message
          : "Échec de génération";
      return Response.json({ error: message }, { status: 500 });
    }

    const description =
      descriptionResult.status === "fulfilled" ? descriptionResult.value : null;
    const descriptionError =
      descriptionResult.status === "rejected"
        ? descriptionResult.reason instanceof Error
          ? descriptionResult.reason.message
          : "Erreur description"
        : null;

    if (skipImage) {
      return Response.json({
        id: null,
        image: null,
        description,
        descriptionError,
      });
    }

    const imageValue = imageResult.status === "fulfilled" ? imageResult.value : null;
    if (!imageValue) {
      return Response.json({ error: "Échec de génération" }, { status: 500 });
    }

    const generatedBuffer = Buffer.from(imageValue.imageBase64, "base64");
    let savedId: string | null = null;
    try {
      const meta = await saveGeneration({
        imageBuffer: generatedBuffer,
        mimeType: imageValue.mimeType,
        preset,
        pose,
        sku,
        extra: extraStr,
        description,
      });
      savedId = meta.id;
    } catch (err) {
      console.error("Failed to save generation to disk:", err);
    }

    return Response.json({
      id: savedId,
      image: `data:${imageValue.mimeType};base64,${imageValue.imageBase64}`,
      mimeType: imageValue.mimeType,
      imageBase64: imageValue.imageBase64,
      description,
      descriptionError,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
