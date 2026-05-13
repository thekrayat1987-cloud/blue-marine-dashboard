import { NextResponse } from "next/server";
import { getWhatsAppAttribution } from "@/lib/shopify-attribution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const data = await getWhatsAppAttribution(12);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Attribution error";
    return NextResponse.json(
      {
        currentMonth: { revenue: 0, orders: 0, customers: 0 },
        previousMonth: { revenue: 0, orders: 0, customers: 0 },
        monthlyHistory: [],
        topCustomers: [],
        currency: "KWD",
        totalScanned: 0,
        attributedCount: 0,
        error: message,
      },
      { status: 200 },
    );
  }
}
