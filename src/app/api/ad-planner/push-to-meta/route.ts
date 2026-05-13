import { NextRequest } from "next/server";
import { pushPlanToMeta } from "@/lib/meta-ads-create";
import type { AdPlan, SelectedProduct } from "@/lib/ad-planner";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const plan = body.plan as AdPlan | undefined;
    const selectedProducts = Array.isArray(body.selectedProducts)
      ? (body.selectedProducts as SelectedProduct[])
      : body.selectedProduct
        ? [body.selectedProduct as SelectedProduct]
        : [];
    const planHistoryId = body.planHistoryId as string | undefined;

    if (!plan || !plan.campaign || !plan.adSets?.length || !plan.adVariants?.length) {
      return Response.json({ error: "Plan invalide ou incomplet" }, { status: 400 });
    }

    const result = await pushPlanToMeta(plan, selectedProducts);

    if (planHistoryId) {
      try {
        await supabase
          .from("ad_planner_history")
          .update({
            meta_campaign_id: result.campaignId,
            meta_adset_id: result.adSetId,
            meta_ad_ids: result.ads.map((a) => a.adId),
            meta_pushed_at: new Date().toISOString(),
          })
          .eq("id", planHistoryId);
      } catch (err) {
        console.warn("Failed to update history with Meta IDs:", err);
      }
    }

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
