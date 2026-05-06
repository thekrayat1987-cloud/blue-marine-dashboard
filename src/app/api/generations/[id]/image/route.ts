import { readGenerationImage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await readGenerationImage(id);
  if (!result) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": result.mimeType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
