import { getCollections } from "@/lib/shopify";

export const runtime = "nodejs";

export async function GET() {
  try {
    const collections = await getCollections();
    return Response.json({ collections });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
