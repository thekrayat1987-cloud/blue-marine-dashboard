const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024;

export function assertAllowedImageMime(mimeType: string): void {
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error("Type d'image non supporté (JPEG, PNG ou WebP uniquement)");
  }
}

export function decodeBase64Image(
  base64: string,
  mimeType: string,
  maxBytes: number = MAX_INLINE_IMAGE_BYTES,
): Buffer {
  assertAllowedImageMime(mimeType);
  if (!base64 || base64.length > Math.ceil(maxBytes * 1.4)) {
    throw new Error("Image trop volumineuse (max 8 Mo)");
  }
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0 || buffer.length > maxBytes) {
    throw new Error("Image trop volumineuse (max 8 Mo)");
  }
  if (!looksLikeImage(buffer, mimeType)) {
    throw new Error("Le contenu de l'image ne correspond pas au type déclaré");
  }
  return buffer;
}

function looksLikeImage(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "image/jpeg") {
    return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === "image/webp") {
    return buffer.length > 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  }
  return false;
}
