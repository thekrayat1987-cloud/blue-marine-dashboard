import { NextResponse, type NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_TYPES = ["Reel", "Story", "Carousel", "Post", "Story + Post"] as const;
const VALID_PRESETS = ["studio", "lookbook", "lifestyle", "riad", "palais", "desert"] as const;

type TemplateBody = {
  id?: string;
  name?: string;
  post_type?: (typeof VALID_TYPES)[number];
  topic?: string;
  caption?: string;
  hashtags?: string;
  preset?: (typeof VALID_PRESETS)[number];
  performance_note?: string | null;
};

export async function GET() {
  const { data, error } = await supabase
    .from("content_templates")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(req: NextRequest) {
  let body: TemplateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name est requis" }, { status: 400 });
  }
  if (!body.post_type || !VALID_TYPES.includes(body.post_type)) {
    return NextResponse.json({ error: "post_type invalide" }, { status: 400 });
  }
  const preset = body.preset ?? "studio";
  if (!VALID_PRESETS.includes(preset)) {
    return NextResponse.json({ error: "preset invalide" }, { status: 400 });
  }

  const row = {
    name,
    post_type: body.post_type,
    topic: body.topic?.trim() ?? "",
    caption: body.caption ?? "",
    hashtags: body.hashtags ?? "",
    preset,
    performance_note: body.performance_note ?? null,
  };

  const { data, error } = await supabase
    .from("content_templates")
    .insert(row)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ template: data });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id requis" }, { status: 400 });
  }
  const { error } = await supabase
    .from("content_templates")
    .delete()
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
