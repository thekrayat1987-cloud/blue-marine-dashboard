import { listGenerations } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  try {
    const items = await listGenerations();
    return Response.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
