import { getNextSku } from "@/lib/shopify";

export const runtime = "nodejs";

export async function GET() {
  try {
    const nextSku = await getNextSku();
    return Response.json({ nextSku });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
