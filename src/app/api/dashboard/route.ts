import { NextResponse } from "next/server";
import { getOrderMetrics } from "@/lib/shopify";
import { getCampaigns, getAdAccountInsights } from "@/lib/meta-ads";
import { getProfile, getInsights } from "@/lib/instagram";

export const dynamic = "force-dynamic";

export async function GET() {
  const errors: string[] = [];

  // Fetch all data in parallel, gracefully handling failures
  const [shopifyResult, metaCampaignsResult, metaInsightsResult, igProfileResult, igInsightsResult] =
    await Promise.allSettled([
      getOrderMetrics(),
      getCampaigns(),
      getAdAccountInsights(),
      getProfile(),
      getInsights(),
    ]);

  const shopify = shopifyResult.status === "fulfilled" ? shopifyResult.value : null;
  if (shopifyResult.status === "rejected") errors.push(`Shopify: ${shopifyResult.reason}`);

  const metaCampaigns = metaCampaignsResult.status === "fulfilled" ? metaCampaignsResult.value : null;
  if (metaCampaignsResult.status === "rejected") errors.push(`Meta Campaigns: ${metaCampaignsResult.reason}`);

  const metaInsights = metaInsightsResult.status === "fulfilled" ? metaInsightsResult.value : null;
  if (metaInsightsResult.status === "rejected") errors.push(`Meta Insights: ${metaInsightsResult.reason}`);

  const igProfile = igProfileResult.status === "fulfilled" ? igProfileResult.value : null;
  if (igProfileResult.status === "rejected") errors.push(`Instagram Profile: ${igProfileResult.reason}`);

  const igInsights = igInsightsResult.status === "fulfilled" ? igInsightsResult.value : null;
  if (igInsightsResult.status === "rejected") errors.push(`Instagram Insights: ${igInsightsResult.reason}`);

  return NextResponse.json({
    shopify: shopify
      ? {
          totalRevenue: shopify.totalRevenue,
          totalOrders: shopify.totalOrders,
          averageOrderValue: shopify.averageOrderValue,
          monthlyBreakdown: shopify.monthlyBreakdown,
        }
      : null,
    meta: {
      campaigns: metaCampaigns || [],
      accountInsights: metaInsights || null,
    },
    instagram: {
      profile: igProfile || null,
      insights: igInsights || null,
    },
    errors: errors.length > 0 ? errors : undefined,
    lastUpdated: new Date().toISOString(),
  });
}
