import { NextResponse } from "next/server";
import { getOrderMetrics, getProducts } from "@/lib/shopify";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [metrics, products] = await Promise.all([getOrderMetrics(), getProducts()]);
    return NextResponse.json({ metrics, products, lastUpdated: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shopify API error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
