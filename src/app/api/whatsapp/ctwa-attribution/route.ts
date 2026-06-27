import { NextRequest, NextResponse } from "next/server";
import { getCtwaAttributionRollup } from "@/lib/whatsapp-attribution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const days = parseInt(request.nextUrl.searchParams.get("days") || "90", 10);
  try {
    const data = await getCtwaAttributionRollup(Number.isFinite(days) ? days : 90);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "CTWA attribution error";
    return NextResponse.json(
      { currency: "KWD", totalOrders: 0, totalRevenue: 0, campaigns: [], error: message },
      { status: 200 },
    );
  }
}
