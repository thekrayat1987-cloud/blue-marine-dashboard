import { NextRequest } from "next/server";
import { generateMarketingPack } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      imageBase64?: string;
      mimeType?: string;
      productTitle?: string;
      productDescription?: string;
      productUrl?: string;
      vibeKeywords?: string;
    };

    if (!body.imageBase64 || !body.mimeType) {
      return Response.json({ error: "Image manquante" }, { status: 400 });
    }
    if (!body.productTitle?.trim() || !body.productDescription?.trim()) {
      return Response.json(
        { error: "Titre et description du produit requis" },
        { status: 400 },
      );
    }

    const pack = await generateMarketingPack({
      imageBase64: body.imageBase64,
      mimeType: body.mimeType,
      productTitle: body.productTitle.trim(),
      productDescription: body.productDescription.trim(),
      productUrl: body.productUrl?.trim() || undefined,
      vibeKeywords: body.vibeKeywords?.trim() || undefined,
    });

    return Response.json({ pack });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
