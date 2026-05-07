import { NextRequest } from "next/server";
import { pushProductToShopify } from "@/lib/shopify";
import { readGenerationMeta, readGenerationImage } from "@/lib/storage";
import type { ProductDescription } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 120;

type InlineImage = { base64: string; mimeType: string };

type InlinePayload = {
  images: InlineImage[];
  description: ProductDescription;
  sku?: string | null;
};

async function loadFromStorage(generationId: string): Promise<InlinePayload | null> {
  const meta = await readGenerationMeta(generationId);
  if (!meta || !meta.description) return null;
  const image = await readGenerationImage(generationId);
  if (!image) return null;
  return {
    images: [{ base64: image.buffer.toString("base64"), mimeType: image.mimeType }],
    description: meta.description,
    sku: meta.sku,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      generationId,
      price,
      collectionIds,
      images: imagesFromBody,
      imageBase64,
      imageMimeType,
      description,
      sku: skuFromBody,
    } = body as {
      generationId?: string;
      price?: string;
      collectionIds?: string[];
      images?: InlineImage[];
      imageBase64?: string;
      imageMimeType?: string;
      description?: ProductDescription;
      sku?: string;
    };

    if (!price || !/^\d+(\.\d{1,3})?$/.test(price)) {
      return Response.json({ error: "Prix invalide (ex: 45 ou 45.000)" }, { status: 400 });
    }

    const inlineImages: InlineImage[] = Array.isArray(imagesFromBody) && imagesFromBody.length > 0
      ? imagesFromBody.filter((i) => i?.base64 && i?.mimeType)
      : imageBase64 && imageMimeType
        ? [{ base64: imageBase64, mimeType: imageMimeType }]
        : [];

    let payload: InlinePayload | null = null;

    if (inlineImages.length > 0 && description) {
      payload = {
        images: inlineImages,
        description,
        sku: skuFromBody ?? null,
      };
    } else if (generationId) {
      payload = await loadFromStorage(generationId);
      if (!payload) {
        return Response.json({ error: "Génération introuvable" }, { status: 404 });
      }
    } else {
      return Response.json(
        { error: "Image ou description manquante" },
        { status: 400 },
      );
    }

    const sku = payload.sku?.trim() || payload.description.sku || "";

    const result = await pushProductToShopify({
      images: payload.images.map((img, idx) => ({
        buffer: Buffer.from(img.base64, "base64"),
        mimeType: img.mimeType,
        filename: `${sku || "product"}-${idx + 1}.${img.mimeType === "image/jpeg" ? "jpg" : "png"}`,
      })),
      sku: sku || `BM-${Date.now()}`,
      vendor: "Atelier Blue Marine",
      enTitle: payload.description.en.title,
      enDescription: payload.description.en.description,
      enHandle: payload.description.urlHandle,
      enSeoTitle: payload.description.en.pageTitle,
      enSeoDescription: payload.description.en.metaDescription,
      arTitle: payload.description.ar.title,
      arDescription: payload.description.ar.description,
      arSeoTitle: payload.description.ar.pageTitle,
      arSeoDescription: payload.description.ar.metaDescription,
      price,
      tags: payload.description.tags,
      collectionIds: Array.isArray(collectionIds) ? collectionIds : [],
    });

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
