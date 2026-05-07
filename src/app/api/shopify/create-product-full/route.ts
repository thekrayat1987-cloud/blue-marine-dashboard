import { NextRequest } from "next/server";
import { pushProductToShopify, addVariantToProduct, getUsedPoeticNames } from "@/lib/shopify";
import { generateProductDescription } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 300;

type ColorInput = {
  name: string;
  imageBase64: string;
  imageMimeType: string;
};

function slug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extFor(mime: string): string {
  return mime === "image/jpeg" ? "jpg" : "png";
}

function colorSkuSuffix(name: string): string {
  const base = slug(name).replace(/-/g, "").toUpperCase().slice(0, 3);
  return base || "VAR";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      sku,
      price,
      pieces,
      hasShawl,
      collectionIds,
      colors,
      inventoryQuantity,
    } = body as {
      sku?: string;
      price?: string;
      pieces?: number;
      hasShawl?: boolean;
      collectionIds?: string[];
      inventoryQuantity?: number;
      colors?: ColorInput[];
    };

    if (!sku?.trim()) {
      return Response.json({ error: "SKU requis (ex: A123)" }, { status: 400 });
    }
    if (!price || !/^\d+(\.\d{1,3})?$/.test(price)) {
      return Response.json({ error: "Prix invalide (ex: 45 ou 45.000)" }, { status: 400 });
    }
    if (!Array.isArray(colors) || colors.length === 0) {
      return Response.json({ error: "Au moins une couleur requise" }, { status: 400 });
    }

    const validColors = colors.filter(
      (c) => c?.name?.trim() && c?.imageBase64 && c?.imageMimeType,
    );
    if (validColors.length === 0) {
      return Response.json(
        { error: "Chaque couleur doit avoir un nom et une image" },
        { status: 400 },
      );
    }

    const cleanSku = sku.trim().toUpperCase();
    const mainColor = validColors[0];

    const usedNames = await getUsedPoeticNames().catch(() => [] as string[]);

    const description = await generateProductDescription({
      imageBase64: mainColor.imageBase64,
      mimeType: mainColor.imageMimeType,
      sku: cleanSku,
      pieces: pieces === 2 || pieces === 3 || pieces === 4 ? pieces : 1,
      hasShawl: Boolean(hasShawl),
      usedNames,
    });

    const mainImageBuffer = Buffer.from(mainColor.imageBase64, "base64");
    const mainResult = await pushProductToShopify({
      images: [
        {
          buffer: mainImageBuffer,
          mimeType: mainColor.imageMimeType,
          filename: `${cleanSku.toLowerCase()}-${slug(mainColor.name)}.${extFor(mainColor.imageMimeType)}`,
        },
      ],
      sku: cleanSku,
      vendor: "Atelier Blue Marine",
      enTitle: description.en.title,
      enDescription: description.en.description,
      enHandle: description.urlHandle,
      enSeoTitle: description.en.pageTitle,
      enSeoDescription: description.en.metaDescription,
      arTitle: description.ar.title,
      arDescription: description.ar.description,
      arSeoTitle: description.ar.pageTitle,
      arSeoDescription: description.ar.metaDescription,
      price,
      tags: description.tags,
      collectionIds: Array.isArray(collectionIds) ? collectionIds : [],
      inventoryQuantity:
        typeof inventoryQuantity === "number" && inventoryQuantity >= 0
          ? Math.floor(inventoryQuantity)
          : undefined,
    });

    const variantResults: Array<{
      color: string;
      variantId?: string;
      error?: string;
    }> = [];

    for (const color of validColors.slice(1)) {
      const colorName = color.name.trim();
      try {
        const result = await addVariantToProduct({
          productId: mainResult.productId,
          colorName,
          price,
          sku: `${cleanSku}-${colorSkuSuffix(colorName)}`,
          imageBuffer: Buffer.from(color.imageBase64, "base64"),
          imageMimeType: color.imageMimeType,
          imageFilename: `${cleanSku.toLowerCase()}-${slug(colorName)}.${extFor(color.imageMimeType)}`,
        });
        variantResults.push({ color: colorName, variantId: result.variantId });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erreur inconnue";
        variantResults.push({ color: colorName, error: message });
      }
    }

    return Response.json({
      productId: mainResult.productId,
      productHandle: mainResult.productHandle,
      adminUrl: mainResult.adminUrl,
      mainColor: mainColor.name.trim(),
      variantResults,
      warnings: mainResult.warnings,
      description,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
