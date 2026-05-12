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
      .from("broadcast_planner_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      // Table missing (migration not yet applied) → return empty list quietly
      if (error.code === "PGRST205" || error.code === "42P01") {
        return Response.json({ items: [], tableMissing: true });
      }
      throw error;
    }
    return Response.json({ items: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    console.warn("broadcast-planner history error:", message);
    return Response.json({ items: [], error: message });
  }
}
