import { NextRequest } from "next/server";
import { generateStoryPoster } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      imageBase64?: string;
      mimeType?: string;
      productTitle?: string;
    };

    if (!body.imageBase64 || !body.mimeType) {
      return Response.json({ error: "Image manquante" }, { status: 400 });
    }
    if (!body.productTitle?.trim()) {
      return Response.json({ error: "Titre du produit requis" }, { status: 400 });
    }

    const result = await generateStoryPoster({
      imageBase64: body.imageBase64,
      mimeType: body.mimeType,
      productTitle: body.productTitle.trim(),
    });

    return Response.json({
      image: `data:${result.mimeType};base64,${result.imageBase64}`,
      mimeType: result.mimeType,
      imageBase64: result.imageBase64,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
