import { NextRequest, NextResponse } from "next/server";
import { getOrderAnalytics } from "@/lib/shopify";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const days = Math.max(7, Math.min(730, parseInt(url.searchParams.get("days") ?? "365", 10) || 365));

  try {
    const data = await getOrderAnalytics(days);
    return NextResponse.json({ ...data, lastUpdated: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur Shopify" },
      { status: 500 },
    );
  }
}
