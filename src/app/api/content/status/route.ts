import { NextResponse, type NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_STATUSES = ["draft", "ready", "posted"] as const;
const VALID_DAYS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"] as const;

type Status = (typeof VALID_STATUSES)[number];

export async function GET(req: NextRequest) {
  const weekStart = req.nextUrl.searchParams.get("week_start");
  if (!weekStart) {
    return NextResponse.json({ error: "week_start query param required (YYYY-MM-DD)" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("content_post_status")
    .select("*")
    .eq("week_start", weekStart);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ entries: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  let body: {
    week_start?: string;
    day?: string;
    time?: string;
    status?: Status;
    custom_caption?: string | null;
    custom_hashtags?: string | null;
    notes?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { week_start, day, time, status, custom_caption, custom_hashtags, notes } = body;

  if (!week_start || !day || !time) {
    return NextResponse.json({ error: "week_start, day and time are required" }, { status: 400 });
  }
  if (!VALID_DAYS.includes(day as typeof VALID_DAYS[number])) {
    return NextResponse.json({ error: "Invalid day" }, { status: 400 });
  }
  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const update: Record<string, unknown> = { week_start, day, time };
  if (status !== undefined) {
    update.status = status;
    update.posted_at = status === "posted" ? new Date().toISOString() : null;
  }
  if (custom_caption !== undefined) update.custom_caption = custom_caption;
  if (custom_hashtags !== undefined) update.custom_hashtags = custom_hashtags;
  if (notes !== undefined) update.notes = notes;

  const { data, error } = await supabase
    .from("content_post_status")
    .upsert(update, { onConflict: "week_start,day,time" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ entry: data });
}
