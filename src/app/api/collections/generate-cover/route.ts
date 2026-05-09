import { NextRequest } from "next/server";
import { generateCollectionCover } from "@/lib/collection-creator";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      enName?: string;
      theme?: string;
      vibePrompt?: string;
    };
    if (!body.enName?.trim() || !body.theme?.trim()) {
      return Response.json(
        { error: "enName et theme requis" },
        { status: 400 },
      );
    }
    const buf = await generateCollectionCover({
      enName: body.enName.trim(),
      theme: body.theme.trim(),
      vibePrompt: body.vibePrompt?.trim() || undefined,
    });
    return Response.json({
      coverBase64: buf.toString("base64"),
      mimeType: "image/jpeg",
      width: 864,
      height: 1536,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Erreur inconnue" },
      { status: 500 },
    );
  }
}
