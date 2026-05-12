import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const limit = Math.min(
    Number.parseInt(url.searchParams.get("limit") ?? "20", 10) || 20,
    50,
  );
  try {
    const { data, error } = await supabase
      .from("captions_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return Response.json({ items: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return Response.json({ error: message, items: [] }, { status: 500 });
  }
}
