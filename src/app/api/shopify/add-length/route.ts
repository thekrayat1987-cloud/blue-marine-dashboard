import { NextRequest } from "next/server";
import { addLengthToProduct } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { productId } = body as { productId?: string };

    if (!productId) {
      return Response.json({ error: "productId requis" }, { status: 400 });
    }

    const result = await addLengthToProduct(productId);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
