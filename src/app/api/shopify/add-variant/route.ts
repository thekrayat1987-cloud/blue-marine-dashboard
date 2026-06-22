import { NextRequest } from "next/server";
import { addVariantToProduct } from "@/lib/shopify";
import { readGenerationMeta, readGenerationImage } from "@/lib/storage";
import { decodeBase64Image } from "@/lib/image-input";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      generationId,
      productId,
      colorName,
      price,
      sku,
      imageBase64,
      imageMimeType,
    } = body as {
      generationId?: string;
      productId?: string;
      colorName?: string;
      price?: string;
      sku?: string;
      imageBase64?: string;
      imageMimeType?: string;
    };

    if (!productId) {
      return Response.json({ error: "productId requis" }, { status: 400 });
    }
    if (!colorName?.trim()) {
      return Response.json({ error: "Nom de couleur requis" }, { status: 400 });
    }
    if (!price || !/^\d+(\.\d{1,3})?$/.test(price)) {
      return Response.json({ error: "Prix invalide (ex: 45 ou 45.000)" }, { status: 400 });
    }

    let imageBuffer: Buffer;
    let mimeType: string;
    let resolvedSku: string;

    if (imageBase64 && imageMimeType) {
      imageBuffer = decodeBase64Image(imageBase64, imageMimeType);
      mimeType = imageMimeType;
      resolvedSku = sku?.trim() || `${Date.now()}`;
    } else if (generationId) {
      const meta = await readGenerationMeta(generationId);
      if (!meta) return Response.json({ error: "Génération introuvable" }, { status: 404 });
      const image = await readGenerationImage(generationId);
      if (!image) return Response.json({ error: "Image introuvable" }, { status: 404 });
      imageBuffer = image.buffer;
      mimeType = image.mimeType;
      resolvedSku = sku?.trim() || meta.sku || generationId;
    } else {
      return Response.json({ error: "Image manquante" }, { status: 400 });
    }

    const ext = mimeType === "image/jpeg" ? "jpg" : "png";

    const result = await addVariantToProduct({
      productId,
      colorName: colorName.trim(),
      price,
      sku: resolvedSku,
      imageBuffer,
      imageMimeType: mimeType,
      imageFilename: `${resolvedSku}-${colorName.trim().toLowerCase()}.${ext}`,
    });

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
