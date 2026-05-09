import { NextRequest } from "next/server";
import { createFullCollection } from "@/lib/shopify-collection";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      enName?: string;
      arName?: string;
      bodyHtmlEn?: string;
      bodyHtmlAr?: string;
      seoTitleEn?: string;
      seoTitleAr?: string;
      seoDescEn?: string;
      seoDescAr?: string;
      productIds?: string[];
      coverImageBase64?: string;
      addToHomepage?: boolean;
      addToNavMenu?: boolean;
    };

    const required: Array<[string, unknown]> = [
      ["enName", body.enName],
      ["arName", body.arName],
      ["bodyHtmlEn", body.bodyHtmlEn],
      ["bodyHtmlAr", body.bodyHtmlAr],
      ["seoTitleEn", body.seoTitleEn],
      ["seoTitleAr", body.seoTitleAr],
      ["seoDescEn", body.seoDescEn],
      ["seoDescAr", body.seoDescAr],
    ];
    for (const [key, val] of required) {
      if (!val || (typeof val === "string" && !val.trim())) {
        return Response.json({ error: `${key} requis` }, { status: 400 });
      }
    }
    const productIds = Array.isArray(body.productIds) ? body.productIds : [];

    const result = await createFullCollection({
      enName: body.enName!.trim(),
      arName: body.arName!.trim(),
      bodyHtmlEn: body.bodyHtmlEn!,
      bodyHtmlAr: body.bodyHtmlAr!,
      seoTitleEn: body.seoTitleEn!,
      seoTitleAr: body.seoTitleAr!,
      seoDescEn: body.seoDescEn!,
      seoDescAr: body.seoDescAr!,
      productIds,
      coverImageBase64: body.coverImageBase64,
      addToHomepage: body.addToHomepage ?? true,
      addToNavMenu: body.addToNavMenu ?? true,
    });

    return Response.json({ result });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Erreur inconnue" },
      { status: 500 },
    );
  }
}
