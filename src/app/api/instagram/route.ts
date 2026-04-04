import { NextResponse } from "next/server";
import { getProfile, getInsights, getRecentMedia } from "@/lib/instagram";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [profile, insights, media] = await Promise.all([getProfile(), getInsights(), getRecentMedia()]);
    return NextResponse.json({ profile, insights, media, lastUpdated: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Instagram API error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
