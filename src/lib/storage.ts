import { promises as fs } from "fs";
import { randomBytes } from "crypto";
import { supabase } from "@/lib/supabase";
import type { ProductDescription, StylePreset, PosePreset } from "./gemini";

const STORAGE_DIR = "/tmp/blue-marine-generated";
const BUCKET = "blue-marine-generated";

function storagePath(filename: string): string {
  return `${STORAGE_DIR}/${filename}`;
}

export type GenerationMeta = {
  id: string;
  createdAt: string;
  sku: string | null;
  preset: StylePreset;
  pose: PosePreset;
  extra: string | null;
  fabric: string | null;
  mimeType: string;
  groupId: string | null;
  description: ProductDescription | null;
};

async function ensureDir() {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
}

function newId(): string {
  return `${Date.now()}-${randomBytes(4).toString("hex")}`;
}

function extensionFor(mimeType: string): "jpg" | "png" | "webp" {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

async function saveLocal(id: string, ext: string, imageBuffer: Buffer, meta: GenerationMeta) {
  await ensureDir();
  await Promise.all([
    fs.writeFile(storagePath(`${id}.${ext}`), imageBuffer),
    fs.writeFile(storagePath(`${id}.json`), JSON.stringify(meta, null, 2), "utf-8"),
  ]);
}

async function saveRemote(id: string, ext: string, imageBuffer: Buffer, meta: GenerationMeta): Promise<boolean> {
  try {
    const bucket = supabase.storage.from(BUCKET);
    const image = await bucket.upload(`${id}.${ext}`, imageBuffer, {
      contentType: meta.mimeType,
      upsert: false,
    });
    if (image.error) throw image.error;
    const metadata = await bucket.upload(`${id}.json`, JSON.stringify(meta, null, 2), {
      contentType: "application/json; charset=utf-8",
      upsert: false,
    });
    if (metadata.error) throw metadata.error;
    return true;
  } catch (error) {
    console.warn(
      `[storage] Supabase storage unavailable; using /tmp fallback: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    return false;
  }
}

export async function saveGeneration(params: {
  imageBuffer: Buffer;
  mimeType: string;
  preset: StylePreset;
  pose: PosePreset;
  sku?: string;
  extra?: string;
  description: ProductDescription | null;
}): Promise<GenerationMeta> {
  const id = newId();
  const ext = extensionFor(params.mimeType);

  const meta: GenerationMeta = {
    id,
    createdAt: new Date().toISOString(),
    sku: params.sku?.trim() || null,
    preset: params.preset,
    pose: params.pose,
    extra: params.extra?.trim() || null,
    fabric: null,
    mimeType: params.mimeType,
    groupId: null,
    description: params.description,
  };

  const savedRemote = await saveRemote(id, ext, params.imageBuffer, meta);
  if (!savedRemote) {
    await saveLocal(id, ext, params.imageBuffer, meta);
  }

  return meta;
}

export async function listGenerations(): Promise<GenerationMeta[]> {
  const remoteItems = await listRemoteGenerations();
  if (remoteItems.length) return remoteItems;
  try {
    await ensureDir();
    const files = await fs.readdir(STORAGE_DIR);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));
    const items = await Promise.all(
      jsonFiles.map(async (f) => {
        try {
          const content = await fs.readFile(storagePath(f), "utf-8");
          return JSON.parse(content) as GenerationMeta;
        } catch {
          return null;
        }
      }),
    );
    return items
      .filter((x): x is GenerationMeta => x !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function readGenerationMeta(id: string): Promise<GenerationMeta | null> {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  const remote = await readRemoteMeta(id);
  if (remote) return remote;
  await ensureDir();
  try {
    const content = await fs.readFile(storagePath(`${id}.json`), "utf-8");
    return JSON.parse(content) as GenerationMeta;
  } catch {
    return null;
  }
}

export async function readGenerationImage(
  id: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  const remote = await readRemoteImage(id);
  if (remote) return remote;
  await ensureDir();
  for (const ext of ["png", "jpg", "webp"] as const) {
    const filePath = storagePath(`${id}.${ext}`);
    try {
      const buffer = await fs.readFile(filePath);
      return {
        buffer,
        mimeType: ext === "jpg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png",
      };
    } catch {
      // try next
    }
  }
  return null;
}

export async function deleteGeneration(id: string): Promise<boolean> {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return false;
  await ensureDir();
  let removed = false;
  try {
    const { data } = await supabase.storage.from(BUCKET).remove([
      `${id}.png`,
      `${id}.jpg`,
      `${id}.webp`,
      `${id}.json`,
    ]);
    if (data?.length) removed = true;
  } catch {
    // fall back to local deletion below
  }
  for (const ext of ["png", "jpg", "webp", "json"] as const) {
    const filePath = storagePath(`${id}.${ext}`);
    try {
      await fs.unlink(filePath);
      removed = true;
    } catch {
      // ignore
    }
  }
  return removed;
}

async function listRemoteGenerations(): Promise<GenerationMeta[]> {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).list("", {
      limit: 200,
      sortBy: { column: "created_at", order: "desc" },
    });
    if (error) throw error;
    const jsonFiles: Array<{ name: string }> = (data || []).filter((f: { name: string }) =>
      f.name.endsWith(".json"),
    );
    const items = await Promise.all(
      jsonFiles.map(async (f) => readRemoteMeta(f.name.replace(/\.json$/, ""))),
    );
    return items
      .filter((x): x is GenerationMeta => x !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

async function readRemoteMeta(id: string): Promise<GenerationMeta | null> {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(`${id}.json`);
    if (error || !data) return null;
    return JSON.parse(await data.text()) as GenerationMeta;
  } catch {
    return null;
  }
}

async function readRemoteImage(id: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  for (const ext of ["png", "jpg", "webp"] as const) {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(`${id}.${ext}`);
      if (error || !data) continue;
      const buffer = Buffer.from(await data.arrayBuffer());
      return {
        buffer,
        mimeType: ext === "jpg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png",
      };
    } catch {
      // try next
    }
  }
  return null;
}
