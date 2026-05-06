import { NextResponse, type NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const { data, error } = await supabase
    .from("shopify_audit_status")
    .select("task_key, done");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ entries: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  let body: { task_key?: string; done?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { task_key, done } = body;
  if (typeof task_key !== "string" || !task_key.trim() || typeof done !== "boolean") {
    return NextResponse.json(
      { error: "task_key (string) and done (boolean) are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("shopify_audit_status")
    .upsert({ task_key, done }, { onConflict: "task_key" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ entry: data });
}
