import { NextRequest } from "next/server";
import {
  streamBroadcastPlan,
  type CampaignType,
  type Tone,
  type SegmentTypeId,
  type SelectedProductLite,
  type GenerateBroadcastInput,
} from "@/lib/broadcast-planner";
import { getOptimalSendTimeSignal } from "@/lib/shopify-customers";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

const VALID_CAMPAIGN_TYPES = new Set<CampaignType>([
  "new_collection",
  "promo_flash",
  "restock",
  "seasonal_occasion",
  "vip_exclusive",
  "recovery",
]);
const VALID_SEGMENT_TYPES = new Set<SegmentTypeId>([
  "vip",
  "inactive_60",
  "inactive_90",
  "by_country",
  "by_product_tag",
  "all_buyers",
]);
const VALID_TONES = new Set<Tone>([
  "luxe_sobre",
  "urgence",
  "chaleureux",
  "exclusif",
]);

function parseBody(body: Record<string, unknown>): GenerateBroadcastInput | { error: string } {
  const campaignType = String(body.campaignType ?? "");
  if (!VALID_CAMPAIGN_TYPES.has(campaignType as CampaignType)) {
    return { error: "Type de campagne invalide" };
  }
  const segmentTypeId = String(body.segmentTypeId ?? "");
  if (!VALID_SEGMENT_TYPES.has(segmentTypeId as SegmentTypeId)) {
    return { error: "Segment invalide" };
  }
  const tone = String(body.tone ?? "luxe_sobre");
  if (!VALID_TONES.has(tone as Tone)) {
    return { error: "Ton invalide" };
  }
  const segmentDescription = String(body.segmentDescription ?? "").trim();
  if (!segmentDescription) return { error: "Description segment manquante" };

  let selectedProduct: SelectedProductLite | undefined;
  if (body.selectedProduct && typeof body.selectedProduct === "object") {
    const sp = body.selectedProduct as Record<string, unknown>;
    if (sp.id && sp.title && sp.handle) {
      selectedProduct = {
        id: String(sp.id),
        title: String(sp.title),
        handle: String(sp.handle),
        imageUrl: sp.imageUrl ? String(sp.imageUrl) : null,
        priceKwd: sp.priceKwd ? Number(sp.priceKwd) : undefined,
      };
    }
  }

  const segmentPreview = body.segmentPreview && typeof body.segmentPreview === "object"
    ? (body.segmentPreview as GenerateBroadcastInput["segmentPreview"])
    : null;

  return {
    campaignType: campaignType as CampaignType,
    segmentTypeId: segmentTypeId as SegmentTypeId,
    segmentPreview,
    segmentDescription,
    occasion: trimOrUndefined(body.occasion),
    promoCode: trimOrUndefined(body.promoCode),
    promoDeadline: trimOrUndefined(body.promoDeadline),
    promoDiscountPct: body.promoDiscountPct ? Number(body.promoDiscountPct) || undefined : undefined,
    tone: tone as Tone,
    selectedProduct,
    customNotes: trimOrUndefined(body.customNotes),
  };
}

function trimOrUndefined(v: unknown): string | undefined {
  const s = String(v ?? "").trim();
  return s || undefined;
}

async function persistHistory(
  input: GenerateBroadcastInput,
  plan: unknown,
  usage: { input_tokens: number; output_tokens: number },
) {
  try {
    await supabase.from("broadcast_planner_history").insert({
      campaign_type: input.campaignType,
      segment_type: input.segmentTypeId,
      segment_filter: { description: input.segmentDescription },
      segment_preview: input.segmentPreview,
      occasion: input.occasion ?? null,
      promo_code: input.promoCode ?? null,
      promo_deadline: input.promoDeadline ?? null,
      tone: input.tone,
      selected_product: input.selectedProduct ?? null,
      plan,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
    });
  } catch (err) {
    console.warn("Failed to persist broadcast_planner_history:", err);
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }

  const parsed = parseBody(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  // Best-effort enrichment with send-time signal
  try {
    parsed.sendTimeSignal = await getOptimalSendTimeSignal();
  } catch (err) {
    console.warn("broadcast-planner: send-time signal unavailable:", err);
    parsed.sendTimeSignal = null;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      try {
        for await (const chunk of streamBroadcastPlan(parsed)) {
          send(chunk);
          if (chunk.type === "done") {
            await persistHistory(parsed, chunk.plan, chunk.usage);
          }
          if (chunk.type === "error") {
            break;
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erreur inconnue";
        send({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
