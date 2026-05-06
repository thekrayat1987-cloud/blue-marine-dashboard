import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import type { ProductDescription, StylePreset, PosePreset } from "./gemini";

const STORAGE_DIR = process.env.VERCEL
  ? "/tmp/blue-marine-generated"
  : path.join(process.cwd(), ".generated");

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

export async function saveGeneration(params: {
  imageBuffer: Buffer;
  mimeType: string;
  preset: StylePreset;
  pose: PosePreset;
  sku?: string;
  extra?: string;
  description: ProductDescription | null;
}): Promise<GenerationMeta> {
  await ensureDir();
  const id = newId();
  const ext = params.mimeType === "image/jpeg" ? "jpg" : "png";
  const imagePath = path.join(STORAGE_DIR, `${id}.${ext}`);
  const metaPath = path.join(STORAGE_DIR, `${id}.json`);

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

  await Promise.all([
    fs.writeFile(imagePath, params.imageBuffer),
    fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8"),
  ]);

  return meta;
}

export async function listGenerations(): Promise<GenerationMeta[]> {
  try {
    await ensureDir();
    const files = await fs.readdir(STORAGE_DIR);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));
    const items = await Promise.all(
      jsonFiles.map(async (f) => {
        try {
          const content = await fs.readFile(path.join(STORAGE_DIR, f), "utf-8");
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
  await ensureDir();
  try {
    const content = await fs.readFile(path.join(STORAGE_DIR, `${id}.json`), "utf-8");
    return JSON.parse(content) as GenerationMeta;
  } catch {
    return null;
  }
}

export async function readGenerationImage(
  id: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  await ensureDir();
  for (const ext of ["png", "jpg"] as const) {
    const filePath = path.join(STORAGE_DIR, `${id}.${ext}`);
    try {
      const buffer = await fs.readFile(filePath);
      return { buffer, mimeType: ext === "jpg" ? "image/jpeg" : "image/png" };
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
  for (const ext of ["png", "jpg", "json"] as const) {
    const filePath = path.join(STORAGE_DIR, `${id}.${ext}`);
    try {
      await fs.unlink(filePath);
      removed = true;
    } catch {
      // ignore
    }
  }
  return removed;
}
