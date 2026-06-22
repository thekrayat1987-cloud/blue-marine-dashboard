import { NextRequest, NextResponse } from "next/server";
import { getBudgetData } from "@/lib/shopify-budget";
import { getAdAccountInsights } from "@/lib/meta-ads";
import { getAccountStats as getSnapStats } from "@/lib/snapchat";
import { getIntegrationAccessToken } from "@/lib/integration-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const goalParam = request.nextUrl.searchParams.get("goal");
    const goal = goalParam ? Number(goalParam) : 50_000;
    const annualGoal = Number.isFinite(goal) && goal > 0 ? goal : 50_000;
    const snapToken = await getIntegrationAccessToken("snapchat", "SNAP_ACCESS_TOKEN");

    // Fetch in parallel — Shopify orders + Meta insights (30d) + Snap stats (lifetime)
    const [shopRes, metaRes, snapRes] = await Promise.allSettled([
      getBudgetData(annualGoal),
      getAdAccountInsights("last_30d"),
      snapToken ? getSnapStats() : Promise.resolve(null),
    ]);

    const data = shopRes.status === "fulfilled" ? shopRes.value : null;
    const meta = metaRes.status === "fulfilled" ? metaRes.value : null;
    const snap = snapRes.status === "fulfilled" ? snapRes.value : null;

    if (!data) {
      throw new Error(
        shopRes.status === "rejected" && shopRes.reason instanceof Error
          ? shopRes.reason.message
          : "Shopify budget data failed",
      );
    }

    return NextResponse.json({
      ...data,
      meta: meta
        ? {
            spendLast30d: meta.totalSpend,
            revenuePixel: meta.totalRevenue,
            conversionsPixel: meta.totalConversions,
            roasPixel: meta.roas,
          }
        : null,
      snapchat: snap
        ? {
            spendLifetime: snap.spend,
            impressions: snap.impressions,
            swipes: snap.swipes,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Budget data error";
    return NextResponse.json(
      {
        error: message,
        goalProgress: null,
        currentMonth: null,
        channels: [],
        categories: [],
        currency: "KWD",
        ytdOrdersScanned: 0,
        meta: null,
        snapchat: null,
      },
      { status: 200 },
    );
  }
}
