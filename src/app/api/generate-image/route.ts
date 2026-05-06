import { NextRequest } from "next/server";
import {
  generateBlueMarineImage,
  generateProductDescription,
  type StylePreset,
  type PosePreset,
} from "@/lib/gemini";
import { saveGeneration } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 120;

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
    const file = formData.get("image");
    const presetRaw = formData.get("preset");
    const poseRaw = formData.get("pose");
    const extra = formData.get("extra");
    const skuRaw = formData.get("sku");
    const piecesRaw = formData.get("pieces");
    const hasShawl = formData.get("hasShawl") === "true";
    const skipDescription = formData.get("skipDescription") === "true";
    const sku = typeof skuRaw === "string" ? skuRaw.trim() : "";
    const piecesParsed = typeof piecesRaw === "string" ? parseInt(piecesRaw, 10) : 1;
    const pieces = ([1, 2, 3, 4].includes(piecesParsed) ? piecesParsed : 1) as 1 | 2 | 3 | 4;

    if (!(file instanceof File)) {
      return Response.json({ error: "Aucune image fournie" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "Image trop volumineuse (max 8 Mo)" }, { status: 400 });
    }
    const preset = ALLOWED_PRESETS.includes(presetRaw as StylePreset)
      ? (presetRaw as StylePreset)
      : "studio";
    const pose = ALLOWED_POSES.includes(poseRaw as PosePreset)
      ? (poseRaw as PosePreset)
      : "three_quarter";

    const buffer = Buffer.from(await file.arrayBuffer());
    const imageBase64 = buffer.toString("base64");
    const mimeType = file.type || "image/jpeg";
    const extraStr = typeof extra === "string" ? extra : "";

    const [imageResult, descriptionResult] = await Promise.allSettled([
      generateBlueMarineImage({
        imageBase64,
        mimeType,
        preset,
        pose,
        pieces,
        hasShawl,
        extraInstructions: extraStr.trim() ? extraStr.trim() : undefined,
      }),
      skipDescription
        ? Promise.resolve(null)
        : generateProductDescription({
            imageBase64,
            mimeType,
            sku: sku || undefined,
            pieces,
            hasShawl,
          }),
    ]);

    if (imageResult.status === "rejected") {
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

    const generatedBuffer = Buffer.from(imageResult.value.imageBase64, "base64");
    let savedId: string | null = null;
    try {
      const meta = await saveGeneration({
        imageBuffer: generatedBuffer,
        mimeType: imageResult.value.mimeType,
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
      image: `data:${imageResult.value.mimeType};base64,${imageResult.value.imageBase64}`,
      mimeType: imageResult.value.mimeType,
      imageBase64: imageResult.value.imageBase64,
      description,
      descriptionError,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
