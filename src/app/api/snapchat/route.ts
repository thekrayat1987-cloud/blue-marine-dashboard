import { NextResponse } from "next/server";
import { getCampaigns, getAccountStats } from "@/lib/snapchat";

export const dynamic = "force-dynamic";

export async function GET() {
  // Check if token exists
  if (!process.env.SNAP_ACCESS_TOKEN) {
    return NextResponse.json({ error: "Not connected. Please connect Snapchat first.", needsAuth: true }, { status: 401 });
  }

  try {
    const [campaigns, stats] = await Promise.allSettled([getCampaigns(), getAccountStats()]);

    return NextResponse.json({
      campaigns: campaigns.status === "fulfilled" ? campaigns.value : [],
      stats: stats.status === "fulfilled" ? stats.value : null,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Snapchat API error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
