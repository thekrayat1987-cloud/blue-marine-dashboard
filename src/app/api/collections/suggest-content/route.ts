import { NextRequest } from "next/server";
import { suggestCollectionContent } from "@/lib/collection-creator";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      enName?: string;
      arName?: string;
      theme?: string;
    };
    if (!body.enName?.trim() || !body.arName?.trim() || !body.theme?.trim()) {
      return Response.json(
        { error: "enName, arName et theme requis" },
        { status: 400 },
      );
    }
    const content = await suggestCollectionContent({
      enName: body.enName.trim(),
      arName: body.arName.trim(),
      theme: body.theme.trim(),
    });
    return Response.json({ content });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Erreur inconnue" },
      { status: 500 },
    );
  }
}
