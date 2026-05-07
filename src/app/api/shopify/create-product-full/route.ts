import { NextRequest } from "next/server";
import { pushProductToShopify, addVariantToProduct, getUsedPoeticNames } from "@/lib/shopify";
import {
  generateBlueMarineImage,
  generateProductDescription,
  type StylePreset,
  type PosePreset,
} from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_PRESET: StylePreset = "studio";
const DEFAULT_POSE: PosePreset = "three_quarter";

type ColorInput = {
  name: string;
  imageBase64: string;
  imageMimeType: string;
};

type GeneratedColor = ColorInput & {
  generatedBase64: string;
  generatedMimeType: string;
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
    const piecesNormalized: 1 | 2 | 3 | 4 =
      pieces === 2 || pieces === 3 || pieces === 4 ? pieces : 1;
    const hasShawlBool = Boolean(hasShawl);

    // Run AI image generation for every color in parallel. We fail-fast: if any
    // color's generation fails, abort the whole creation rather than mixing
    // raw hanger photos with AI-generated photos in the same product.
    const generationResults = await Promise.allSettled(
      validColors.map((color) =>
        generateBlueMarineImage({
          imageBase64: color.imageBase64,
          mimeType: color.imageMimeType,
          preset: DEFAULT_PRESET,
          pose: DEFAULT_POSE,
          pieces: piecesNormalized,
          hasShawl: hasShawlBool,
        }),
      ),
    );
    const generationErrors = generationResults
      .map((r, i) =>
        r.status === "rejected"
          ? `${validColors[i].name.trim()}: ${
              r.reason instanceof Error ? r.reason.message : "génération échouée"
            }`
          : null,
      )
      .filter((m): m is string => Boolean(m));
    if (generationErrors.length) {
      return Response.json(
        {
          error: `Échec de génération IA: ${generationErrors.join(" | ")}`,
        },
        { status: 502 },
      );
    }

    const generatedColors: GeneratedColor[] = validColors.map((color, i) => {
      const result = generationResults[i];
      // status is guaranteed "fulfilled" here — we just returned on any rejection
      if (result.status !== "fulfilled") {
        throw new Error("Unexpected generation state");
      }
      return {
        ...color,
        generatedBase64: result.value.imageBase64,
        generatedMimeType: result.value.mimeType,
      };
    });

    const mainColor = generatedColors[0];

    const usedNames = await getUsedPoeticNames().catch(() => [] as string[]);

    const description = await generateProductDescription({
      imageBase64: mainColor.imageBase64,
      mimeType: mainColor.imageMimeType,
      sku: cleanSku,
      pieces: piecesNormalized,
      hasShawl: hasShawlBool,
      usedNames,
      colorList:
        validColors.length > 1
          ? validColors.map((c) => c.name.trim())
          : undefined,
    });

    const mainImageBuffer = Buffer.from(mainColor.generatedBase64, "base64");
    const principalColor = mainColor.name.trim();
    const mainResult = await pushProductToShopify({
      images: [
        {
          buffer: mainImageBuffer,
          mimeType: mainColor.generatedMimeType,
          filename: `${cleanSku.toLowerCase()}-${slug(principalColor)}.${extFor(mainColor.generatedMimeType)}`,
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
      principalColor: validColors.length > 1 ? principalColor : undefined,
      colorList:
        validColors.length > 1
          ? validColors.map((c) => c.name.trim())
          : undefined,
    });

    const variantResults: Array<{
      color: string;
      variantId?: string;
      error?: string;
    }> = [];

    for (const color of generatedColors.slice(1)) {
      const colorName = color.name.trim();
      try {
        const result = await addVariantToProduct({
          productId: mainResult.productId,
          colorName,
          price,
          sku: `${cleanSku}-${colorSkuSuffix(colorName)}`,
          imageBuffer: Buffer.from(color.generatedBase64, "base64"),
          imageMimeType: color.generatedMimeType,
          imageFilename: `${cleanSku.toLowerCase()}-${slug(colorName)}.${extFor(color.generatedMimeType)}`,
          inventoryQuantity:
            typeof inventoryQuantity === "number" && inventoryQuantity >= 0
              ? Math.floor(inventoryQuantity)
              : undefined,
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
