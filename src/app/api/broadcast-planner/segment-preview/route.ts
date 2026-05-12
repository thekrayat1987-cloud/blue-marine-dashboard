import { NextRequest } from "next/server";
import { previewSegment, type SegmentFilter, type GccCountry } from "@/lib/shopify-customers";

export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_TYPES = new Set([
  "vip",
  "inactive_60",
  "inactive_90",
  "by_country",
  "by_product_tag",
  "all_buyers",
]);
const VALID_COUNTRIES = new Set<GccCountry>(["KW", "SA", "AE", "QA", "BH", "OM"]);

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }

  const type = String(body.type ?? "");
  if (!VALID_TYPES.has(type)) {
    return Response.json({ error: "Type de segment invalide" }, { status: 400 });
  }

  const filter: SegmentFilter = { type: type as SegmentFilter["type"] };

  if (type === "by_country") {
    const country = String(body.country ?? "");
    if (!VALID_COUNTRIES.has(country as GccCountry)) {
      return Response.json({ error: "Pays invalide (KW, SA, AE, QA, BH, OM)" }, { status: 400 });
    }
    filter.country = country as GccCountry;
  }
  if (type === "by_product_tag") {
    const tag = String(body.productTag ?? "").trim();
    if (!tag) return Response.json({ error: "Tag produit manquant" }, { status: 400 });
    filter.productTag = tag;
  }
  if (type === "vip") {
    if (body.minOrders) filter.minOrders = Number(body.minOrders) || 2;
    if (body.minSpentKwd) filter.minSpentKwd = Number(body.minSpentKwd) || undefined;
  }

  try {
    const preview = await previewSegment(filter);
    return Response.json({ preview });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur Shopify";
    return Response.json({ error: message }, { status: 500 });
  }
}
