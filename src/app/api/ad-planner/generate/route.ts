import { NextRequest } from "next/server";
import {
  generateAdPlan,
  streamAdPlan,
  type AdPlanCountry,
  type CampaignObjective,
  type SelectedProduct,
} from "@/lib/ad-planner";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

const ALLOWED_COUNTRIES = new Set<AdPlanCountry>([
  "Kuwait",
  "Saudi Arabia",
  "United Arab Emirates",
  "Qatar",
  "Bahrain",
  "Oman",
]);

const ALLOWED_OBJECTIVES = new Set<CampaignObjective | "AUTO">([
  "AUTO",
  "OUTCOME_SALES",
  "OUTCOME_TRAFFIC",
  "OUTCOME_AWARENESS",
  "OUTCOME_ENGAGEMENT",
  "OUTCOME_LEADS",
]);

type ParsedBody = {
  brief: string;
  productUrl?: string;
  selectedProduct?: SelectedProduct;
  budgetKwd?: number;
  durationDays?: number;
  primaryCountry?: AdPlanCountry;
  objectiveHint: CampaignObjective | "AUTO";
  regenerateNote?: string;
};

function parseBody(body: Record<string, unknown>): ParsedBody | { error: string } {
  const brief = String(body.brief ?? "").trim();
  if (!brief) return { error: "Brief requis" };
  if (brief.length > 4000) return { error: "Brief trop long (max 4000 caractères)" };

  const productUrl = String(body.productUrl ?? "").trim() || undefined;
  const budgetKwdRaw = Number(body.budgetKwd);
  const budgetKwd =
    Number.isFinite(budgetKwdRaw) && budgetKwdRaw > 0 ? budgetKwdRaw : undefined;
  const durationDaysRaw = Number(body.durationDays);
  const durationDays =
    Number.isFinite(durationDaysRaw) && durationDaysRaw > 0
      ? Math.floor(durationDaysRaw)
      : undefined;

  const primaryCountryRaw = String(body.primaryCountry ?? "");
  const primaryCountry = ALLOWED_COUNTRIES.has(primaryCountryRaw as AdPlanCountry)
    ? (primaryCountryRaw as AdPlanCountry)
    : undefined;

  const objectiveHintRaw = String(body.objectiveHint ?? "AUTO");
  const objectiveHint = ALLOWED_OBJECTIVES.has(
    objectiveHintRaw as CampaignObjective | "AUTO",
  )
    ? (objectiveHintRaw as CampaignObjective | "AUTO")
    : "AUTO";

  const regenerateNote = String(body.regenerateNote ?? "").trim() || undefined;

  let selectedProduct: SelectedProduct | undefined;
  if (body.selectedProduct && typeof body.selectedProduct === "object") {
    const sp = body.selectedProduct as Record<string, unknown>;
    if (sp.id && sp.title && sp.handle) {
      selectedProduct = {
        id: String(sp.id),
        title: String(sp.title),
        handle: String(sp.handle),
        imageUrl: sp.imageUrl ? String(sp.imageUrl) : null,
        options: Array.isArray(sp.options)
          ? (sp.options as SelectedProduct["options"])
          : [],
      };
    }
  }

  return {
    brief,
    productUrl,
    selectedProduct,
    budgetKwd,
    durationDays,
    primaryCountry,
    objectiveHint,
    regenerateNote,
  };
}

async function persistHistory(input: ParsedBody, plan: unknown, usage: { input_tokens: number; output_tokens: number }) {
  try {
    await supabase.from("ad_planner_history").insert({
      brief: input.brief,
      product_url: input.productUrl ?? null,
      budget_kwd: input.budgetKwd ?? null,
      duration_days: input.durationDays ?? null,
      primary_country: input.primaryCountry ?? null,
      objective_hint: input.objectiveHint,
      plan,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
    });
  } catch (err) {
    console.warn("Failed to persist ad_planner_history:", err);
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

  const wantsStream = String(body.stream ?? "") === "true";

  if (!wantsStream) {
    try {
      const result = await generateAdPlan(parsed);
      await persistHistory(parsed, result.plan, result.raw_usage);
      return Response.json({ plan: result.plan, usage: result.raw_usage });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      return Response.json({ error: message }, { status: 500 });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      try {
        for await (const chunk of streamAdPlan(parsed)) {
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
