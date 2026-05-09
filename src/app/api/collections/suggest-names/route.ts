import { NextRequest } from "next/server";
import { suggestCollectionNames } from "@/lib/collection-creator";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      theme?: string;
      referenceImageBase64?: string;
      referenceImageMime?: string;
    };
    if (!body.theme?.trim()) {
      return Response.json({ error: "Le thème est requis" }, { status: 400 });
    }
    const proposals = await suggestCollectionNames({
      theme: body.theme.trim(),
      referenceImageBase64: body.referenceImageBase64,
      referenceImageMime: body.referenceImageMime,
    });
    return Response.json({ proposals });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Erreur inconnue" },
      { status: 500 },
    );
  }
}
