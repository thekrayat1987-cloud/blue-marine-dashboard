import { NextResponse } from "next/server";
import { getCampaigns, getAdAccountInsights } from "@/lib/meta-ads";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [campaigns, insights] = await Promise.all([getCampaigns(), getAdAccountInsights()]);
    return NextResponse.json({ campaigns, insights, lastUpdated: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Meta API error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
