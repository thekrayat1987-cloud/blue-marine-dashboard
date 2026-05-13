import { NextResponse } from "next/server";
import { classifyCampaign, getCampaigns } from "@/lib/meta-ads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const campaigns = await getCampaigns("last_30d");
    const audit = campaigns.map(classifyCampaign);

    const totals = audit.reduce(
      (acc, c) => {
        if (c.verdict === "cut") {
          acc.toCut += 1;
          acc.wastedSpend += c.spend;
          if (c.potentialMonthlySavings) acc.monthlySavings += c.potentialMonthlySavings;
        } else if (c.verdict === "scale") {
          acc.toScale += 1;
          if (c.recommendedBudgetIncrease) acc.recommendedAddBudget += c.recommendedBudgetIncrease;
        } else if (c.verdict === "watch") {
          acc.toWatch += 1;
        } else if (c.verdict === "no_data") {
          acc.noData += 1;
        }
        return acc;
      },
      {
        toCut: 0,
        toScale: 0,
        toWatch: 0,
        noData: 0,
        wastedSpend: 0,
        monthlySavings: 0,
        recommendedAddBudget: 0,
      },
    );

    return NextResponse.json({
      audit,
      totals,
      window: "last_30d",
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Audit error";
    return NextResponse.json({ error: message, audit: [], totals: null }, { status: 200 });
  }
}
