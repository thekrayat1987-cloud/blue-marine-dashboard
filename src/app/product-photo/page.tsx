"use client";

import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Upload,
  Download,
  Loader2,
  AlertCircle,
  ImageIcon,
  Copy,
  Check,
  FileText,
  RefreshCw,
  ShoppingBag,
  ExternalLink,
  Megaphone,
  AtSign,
  MessageCircle,
  Video,
  Music2,
  Hash,
  Plus,
} from "lucide-react";

type Preset = "studio" | "lookbook" | "lifestyle" | "riad" | "palais" | "desert";
type Pose =
  | "front"
  | "three_quarter"
  | "profile"
  | "back"
  | "walking"
  | "seated"
  | "looking_back"
  | "detail_close"
  | "low_angle";

type LocalizedDescription = {
  title: string;
  description: string;
  pageTitle: string;
  metaDescription: string;
};

type ProductDescription = {
  sku: string;
  urlHandle: string;
  en: LocalizedDescription;
  ar: LocalizedDescription;
  tags: string[];
};

type ReelScene = {
  shot: string;
  action: string;
  onScreenText: string;
  voiceOver: string;
};

type ReelScript = {
  hook: string;
  scenes: ReelScene[];
  cta: string;
  musicMood: string;
};

type MarketingPack = {
  instagram: {
    en: { caption: string; hashtags: string[] };
    ar: { caption: string; hashtags: string[] };
  };
  whatsapp: { en: string; ar: string };
  reel: { ar: ReelScript };
};

type ShopifyCollection = { id: string; title: string; handle: string };

type ShopifyProductLite = {
  id: string;
  title: string;
  handle: string;
  imageUrl: string | null;
  options: Array<{ name: string; values: string[] }>;
};

type PushResult = {
  productId: string;
  productHandle: string;
  adminUrl: string;
  warnings: string[];
};

type AddVariantResult = {
  variantId: string;
  productHandle: string;
  adminUrl: string;
  warnings: string[];
};

const PRESETS: { id: Preset; label: string; description: string }[] = [
  { id: "studio", label: "Studio", description: "Mannequin, fond crème, lumière douce" },
  { id: "lookbook", label: "Lookbook", description: "Intérieur architectural, golden hour" },
  { id: "lifestyle", label: "Lifestyle", description: "Méditerranée, terrasse, golden hour" },
  { id: "riad", label: "Riad", description: "Cour marocaine, zellige, fontaine, lanternes" },
  { id: "palais", label: "Palais", description: "Marbre, lustre, velours, soirée royale" },
  { id: "desert", label: "Désert", description: "Dunes dorées, golden hour, cinématique" },
];

const POSES: { id: Pose; label: string; emoji: string }[] = [
  { id: "front", label: "Face", emoji: "🧍‍♀️" },
  { id: "three_quarter", label: "3/4", emoji: "💃" },
  { id: "profile", label: "Profil", emoji: "👤" },
  { id: "back", label: "Dos", emoji: "🔄" },
  { id: "looking_back", label: "Regard épaule", emoji: "👗" },
  { id: "walking", label: "En marche", emoji: "🚶‍♀️" },
  { id: "seated", label: "Assise", emoji: "🪑" },
  { id: "low_angle", label: "Contre-plongée", emoji: "📐" },
  { id: "detail_close", label: "Détail / Buste", emoji: "✨" },
];

// Vercel rejects request bodies > 4.5 MB at the edge with a plain-text 413 — keep payload comfortably below.
const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
const COMPRESS_MAX_DIMENSION = 2048;

async function compressForUpload(file: File): Promise<File> {
  if (file.size <= UPLOAD_MAX_BYTES && file.type === "image/jpeg") {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, COMPRESS_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const targetW = Math.round(bitmap.width * scale);
  const targetH = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();

  for (const quality of [0.9, 0.8, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (blob && blob.size <= UPLOAD_MAX_BYTES) {
      const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
      return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
    }
  }
  // Last resort — return the smallest we got even if still over limit.
  const fallback = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.5),
  );
  if (fallback) {
    return new File([fallback], "photo.jpg", { type: "image/jpeg" });
  }
  return file;
}

const VALID_PRESETS: Preset[] = ["studio", "lookbook", "lifestyle", "riad", "palais", "desert"];

function readPresetFromUrl(): Preset {
  if (typeof window === "undefined") return "studio";
  const fromUrl = new URLSearchParams(window.location.search).get("preset");
  return fromUrl && (VALID_PRESETS as string[]).includes(fromUrl) ? (fromUrl as Preset) : "studio";
}

export default function ProductPhotoPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>("studio");

  useEffect(() => {
    setPreset(readPresetFromUrl());
  }, []);
  const [poses, setPoses] = useState<Pose[]>(["three_quarter"]);
  const [extra, setExtra] = useState("");
  const [sku, setSku] = useState("");
  const [pieces, setPieces] = useState<1 | 2 | 3 | 4>(1);
  const [hasShawl, setHasShawl] = useState(false);
  const [generateText, setGenerateText] = useState(true);
  const [autoDownload, setAutoDownload] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem("bluemarine-auto-download");
    return stored === null ? true : stored === "true";
  });
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [activeResultPose, setActiveResultPose] = useState<Pose | null>(null);
  const [extraResults, setExtraResults] = useState<Array<{ pose: Pose; url: string; id: string }>>([]);
  const [description, setDescription] = useState<ProductDescription | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeLang, setActiveLang] = useState<"en" | "ar">("en");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [marketingPack, setMarketingPack] = useState<MarketingPack | null>(null);
  const [marketingLoading, setMarketingLoading] = useState(false);
  const [marketingError, setMarketingError] = useState<string | null>(null);
  const [marketingLang, setMarketingLang] = useState<"en" | "ar">("en");
  const [storyPosterUrl, setStoryPosterUrl] = useState<string | null>(null);
  const [storyLoading, setStoryLoading] = useState(false);
  const [storyError, setStoryError] = useState<string | null>(null);
  const [skuLoading, setSkuLoading] = useState(false);
  const [skuTouched, setSkuTouched] = useState(false);

  async function suggestNextSku(opts?: { force?: boolean }) {
    setSkuLoading(true);
    try {
      const res = await fetch("/api/shopify/next-sku");
      const data = await res.json();
      if (typeof data.nextSku === "string" && data.nextSku) {
        if (opts?.force || !skuTouched) {
          setSku(data.nextSku);
          setSkuTouched(false);
        }
      }
    } catch {
      // ignore
    } finally {
      setSkuLoading(false);
    }
  }

  useEffect(() => {
    suggestNextSku();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFile(file: File) {
    setSourceFile(file);
    setResultUrl(null);
    setResultId(null);
    setDescription(null);
    setDescriptionError(null);
    setError(null);
    setMarketingPack(null);
    setMarketingError(null);
    setStoryPosterUrl(null);
    setStoryError(null);
    const reader = new FileReader();
    reader.onload = () => setSourcePreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function resetForNewProduct() {
    setSourceFile(null);
    setSourcePreview(null);
    setResultUrl(null);
    setResultId(null);
    setActiveResultPose(null);
    setExtraResults([]);
    setDescription(null);
    setDescriptionError(null);
    setError(null);
    setMarketingPack(null);
    setMarketingError(null);
    setStoryPosterUrl(null);
    setStoryError(null);
    setExtra("");
    setPieces(1);
    setHasShawl(false);
    setSkuTouched(false);
    suggestNextSku({ force: true });
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) handleFile(file);
  }

  async function generate() {
    if (!sourceFile || poses.length === 0) return;
    setLoading(true);
    setError(null);
    setDescriptionError(null);
    setResultUrl(null);
    setResultId(null);
    setActiveResultPose(null);
    setExtraResults([]);
    setDescription(null);
    setMarketingPack(null);
    setMarketingError(null);
    setStoryPosterUrl(null);
    setStoryError(null);
    try {
      const uploadFile = await compressForUpload(sourceFile);

      type GenResp = {
        image?: string;
        id?: string;
        description?: ProductDescription;
        descriptionError?: string;
        error?: string;
      };

      const buildFormData = (poseId: Pose, skipDesc: boolean) => {
        const fd = new FormData();
        fd.append("image", uploadFile);
        fd.append("preset", preset);
        fd.append("pose", poseId);
        if (extra.trim()) fd.append("extra", extra.trim());
        if (sku.trim()) fd.append("sku", sku.trim());
        fd.append("pieces", String(pieces));
        if (hasShawl) fd.append("hasShawl", "true");
        if (skipDesc || !generateText) fd.append("skipDescription", "true");
        return fd;
      };

      const requests = poses.map((p, i) =>
        fetch("/api/generate-image", {
          method: "POST",
          body: buildFormData(p, i > 0),
        }).then(async (res) => {
          const raw = await res.text();
          let data: GenResp;
          try {
            data = JSON.parse(raw);
          } catch {
            if (res.status === 413) {
              throw new Error("Image trop volumineuse même après compression. Essaie une photo plus petite.");
            }
            throw new Error(`Erreur serveur (${res.status}) — ${raw.slice(0, 120)}`);
          }
          if (!res.ok) throw new Error(data.error ?? "Échec de génération");
          return { pose: p, data };
        }),
      );

      const results = await Promise.all(requests);
      const [primary, ...rest] = results;

      if (primary.data.image) setResultUrl(primary.data.image);
      if (primary.data.id) setResultId(primary.data.id);
      setActiveResultPose(primary.pose);
      if (primary.data.description) setDescription(primary.data.description);
      if (primary.data.descriptionError) setDescriptionError(primary.data.descriptionError);

      setExtraResults(
        rest
          .filter((r) => r.data.image && r.data.id)
          .map((r) => ({ pose: r.pose, url: r.data.image as string, id: r.data.id as string })),
      );

      if (autoDownload) {
        const slug = (sku.trim() || `${Date.now()}`).toLowerCase().replace(/[^a-z0-9]+/g, "-");
        for (const r of results) {
          if (!r.data.image) continue;
          const a = document.createElement("a");
          a.href = r.data.image;
          a.download = `bluemarine-${slug}-${preset}-${r.pose}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  async function generateDescriptionOnly() {
    if (!sourceFile) return;
    setLoading(true);
    setError(null);
    setDescriptionError(null);
    setResultUrl(null);
    setResultId(null);
    setActiveResultPose(null);
    setExtraResults([]);
    setDescription(null);
    setMarketingPack(null);
    setMarketingError(null);
    setStoryPosterUrl(null);
    setStoryError(null);
    try {
      const uploadFile = await compressForUpload(sourceFile);
      const fd = new FormData();
      fd.append("image", uploadFile);
      fd.append("preset", preset);
      fd.append("pose", poses[0] ?? "three_quarter");
      if (extra.trim()) fd.append("extra", extra.trim());
      if (sku.trim()) fd.append("sku", sku.trim());
      fd.append("pieces", String(pieces));
      if (hasShawl) fd.append("hasShawl", "true");
      fd.append("skipImage", "true");

      const res = await fetch("/api/generate-image", { method: "POST", body: fd });
      const raw = await res.text();
      let data: {
        description?: ProductDescription;
        descriptionError?: string;
        error?: string;
      };
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(`Erreur serveur (${res.status}) — ${raw.slice(0, 120)}`);
      }
      if (!res.ok) throw new Error(data.error ?? "Échec de génération");
      if (data.description) setDescription(data.description);
      if (data.descriptionError) setDescriptionError(data.descriptionError);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  function selectExtraResult(target: { pose: Pose; url: string; id: string }) {
    if (!resultUrl || !resultId || !activeResultPose) return;
    const previousPrimary = { pose: activeResultPose, url: resultUrl, id: resultId };
    setResultUrl(target.url);
    setResultId(target.id);
    setActiveResultPose(target.pose);
    setExtraResults((prev) => prev.map((r) => (r.id === target.id ? previousPrimary : r)));
  }

  function togglePose(p: Pose) {
    setPoses((current) => {
      if (current.includes(p)) {
        return current.length > 1 ? current.filter((x) => x !== p) : current;
      }
      if (current.length >= 2) {
        return [current[1], p];
      }
      return [...current, p];
    });
  }

  function downloadResult() {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = `bluemarine-${preset}-${activeResultPose ?? "photo"}-${Date.now()}.png`;
    a.click();
  }

  async function copyText(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }

  async function generateMarketing() {
    if (!resultUrl || !description) return;
    const parsed = parseInlineImage(resultUrl);
    if (!parsed) return;
    setMarketingLoading(true);
    setMarketingError(null);
    try {
      const res = await fetch("/api/marketing-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: parsed.base64,
          mimeType: parsed.mimeType,
          productTitle: description.en.title,
          productDescription: description.en.description,
          productUrl: description.urlHandle
            ? `https://bluemarine-atelier.com/products/${description.urlHandle}`
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur de génération");
      setMarketingPack(data.pack as MarketingPack);
    } catch (err) {
      setMarketingError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setMarketingLoading(false);
    }
  }

  async function generateStory() {
    if (!resultUrl || !description) return;
    const parsed = parseInlineImage(resultUrl);
    if (!parsed) return;
    setStoryLoading(true);
    setStoryError(null);
    try {
      const res = await fetch("/api/story-poster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: parsed.base64,
          mimeType: parsed.mimeType,
          productTitle: description.en.title,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur de génération");
      setStoryPosterUrl(data.image as string);
    } catch (err) {
      setStoryError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setStoryLoading(false);
    }
  }

  function downloadStory() {
    if (!storyPosterUrl) return;
    const a = document.createElement("a");
    a.href = storyPosterUrl;
    a.download = `bluemarine-story-${(description?.urlHandle || "produit")}-${Date.now()}.png`;
    a.click();
  }

  const currentLoc = description ? description[activeLang] : null;

  return (
    <div className="flex-1 overflow-auto">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md px-8 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-accent" />
            <div>
              <h1 className="text-xl font-bold text-foreground">Photos Produits IA</h1>
              <p className="text-sm text-foreground-muted mt-0.5">
                Photos style Blue Marine + fiche produit Shopify bilingue (EN / AR)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/product-photo/full"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 transition-colors"
              title="Créer un produit avec plusieurs couleurs en une fois"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              Produit complet
            </a>
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-accent text-foreground">
              <Sparkles className="w-3.5 h-3.5" />
              Générer
            </div>
          </div>
        </div>
      </header>

      <div className="p-8 grid lg:grid-cols-2 gap-6 max-w-7xl">
        {/* LEFT — Input */}
        <div className="space-y-6">
          <div className="rounded-xl bg-surface border border-border p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">1. Photo source</h2>
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border-2 border-dashed border-border hover:border-accent/40 transition-colors p-8 cursor-pointer text-center"
            >
              {sourcePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sourcePreview} alt="source" className="max-h-64 mx-auto rounded-lg" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-foreground-muted">
                  <Upload className="w-8 h-8" />
                  <p className="text-sm">Glisse ton image ici ou clique pour choisir</p>
                  <p className="text-xs text-foreground-subtle">JPG, PNG · compression auto</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onPick}
                className="hidden"
              />
            </div>
          </div>

          <div className="rounded-xl bg-surface border border-border p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">2. Style de scène</h2>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPreset(p.id)}
                  className={`text-left rounded-lg p-3 border transition-colors ${
                    preset === p.id
                      ? "border-accent bg-accent/10 text-foreground"
                      : "border-border text-foreground-muted hover:border-border-strong hover:text-foreground"
                  }`}
                >
                  <div className="text-sm font-medium">{p.label}</div>
                  <div className="text-[11px] text-foreground-subtle mt-1 leading-snug">{p.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-surface border border-border p-6">
            <h2 className="text-sm font-semibold text-foreground mb-1">3. Pose du mannequin</h2>
            <p className="text-[11px] text-foreground-subtle mb-3">
              Choisis 1 ou 2 poses. {poses.length === 2 ? "2 photos seront générées en parallèle." : "Sélectionne une 2e pose pour générer 2 photos."}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {POSES.map((p) => {
                const idx = poses.indexOf(p.id);
                const selected = idx >= 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePose(p.id)}
                    className={`relative flex flex-col items-center gap-1 rounded-lg p-3 border transition-colors ${
                      selected
                        ? "border-accent bg-accent/10 text-foreground"
                        : "border-border text-foreground-muted hover:border-border-strong hover:text-foreground"
                    }`}
                  >
                    {selected && poses.length > 1 && (
                      <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-accent text-foreground text-[10px] font-semibold flex items-center justify-center">
                        {idx + 1}
                      </span>
                    )}
                    <span className="text-xl leading-none">{p.emoji}</span>
                    <span className="text-[11px] font-medium">{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl bg-surface border border-border p-6 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-2">4. SKU produit</h2>
              <div className="flex gap-2">
                <input
                  value={sku}
                  onChange={(e) => {
                    setSku(e.target.value.toUpperCase());
                    setSkuTouched(true);
                  }}
                  className="flex-1 rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-accent/50"
                  placeholder={skuLoading ? "Lecture Shopify..." : "Ex: A122"}
                  maxLength={8}
                />
                <button
                  type="button"
                  onClick={() => suggestNextSku({ force: true })}
                  disabled={skuLoading}
                  title="Générer le prochain SKU depuis Shopify"
                  className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-border bg-background text-foreground-muted hover:text-foreground hover:border-accent/50 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${skuLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
              <p className="text-[11px] text-foreground-subtle mt-1">
                Auto-généré depuis le dernier produit Shopify. Clique sur ↻ pour rafraîchir.
              </p>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-2">5. Composition de l&apos;ensemble</h2>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 rounded-lg bg-background border border-border p-1">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPieces(n as 1 | 2 | 3 | 4)}
                      className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                        pieces === n
                          ? "bg-accent text-foreground"
                          : "text-foreground-muted hover:text-foreground"
                      }`}
                    >
                      {n === 1 ? "1 pièce" : `${n} pièces`}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-xs text-foreground-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasShawl}
                    onChange={(e) => setHasShawl(e.target.checked)}
                    className="w-4 h-4 accent-accent"
                  />
                  Avec châle assorti
                </label>
              </div>
              <p className="text-[11px] text-foreground-subtle mt-1">
                Ces infos guident l&apos;IA (image + fiche produit)
              </p>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-2">6. Instructions optionnelles</h2>
              <textarea
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                rows={3}
                className="w-full rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-accent/50"
                placeholder="Ex: mannequin brun, ceinture dorée, fond plus sombre..."
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <label className="flex items-center gap-2 text-xs text-foreground-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={generateText}
                  onChange={(e) => setGenerateText(e.target.checked)}
                  className="w-4 h-4 accent-accent"
                />
                Générer aussi la fiche produit Shopify (EN + AR)
              </label>
              <label className="flex items-center gap-2 text-xs text-foreground-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoDownload}
                  onChange={(e) => {
                    setAutoDownload(e.target.checked);
                    if (typeof window !== "undefined") {
                      window.localStorage.setItem(
                        "bluemarine-auto-download",
                        String(e.target.checked),
                      );
                    }
                  }}
                  className="w-4 h-4 accent-accent"
                />
                Télécharger automatiquement sur mon appareil
              </label>
            </div>
          </div>

          <button
            onClick={generate}
            disabled={!sourceFile || loading || poses.length === 0}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-accent text-foreground text-sm font-semibold hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Génération en cours... (~20-40s)
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {poses.length > 1
                  ? `Générer ${poses.length} photos + fiche produit`
                  : "Générer la photo + fiche produit"}
              </>
            )}
          </button>

          <button
            onClick={generateDescriptionOnly}
            disabled={!sourceFile || loading}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-surface border border-border text-foreground-muted text-xs font-medium hover:text-foreground hover:border-accent/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Génération en cours...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                Générer uniquement la fiche produit (sans photos)
              </>
            )}
          </button>
        </div>

        {/* RIGHT — Output */}
        <div className="space-y-6">
          <div className="rounded-xl bg-surface border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Photo générée</h2>
              {resultUrl && (
                <button
                  onClick={downloadResult}
                  className="inline-flex items-center gap-1.5 text-xs text-accent hover:text-foreground transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Télécharger
                </button>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg mb-4">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="rounded-lg bg-background/50 border border-border aspect-[3/4] flex items-center justify-center overflow-hidden">
              {loading ? (
                <div className="flex flex-col items-center gap-3 text-foreground-subtle">
                  <Loader2 className="w-8 h-8 animate-spin text-accent" />
                  <p className="text-xs">Gemini transforme ton image...</p>
                </div>
              ) : resultUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={resultUrl} alt="résultat" className="w-full h-full object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-foreground-subtle">
                  <ImageIcon className="w-8 h-8" />
                  <p className="text-xs">Le résultat apparaîtra ici</p>
                </div>
              )}
            </div>

            {extraResults.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] text-foreground-subtle mb-2">
                  Autres poses générées — clique pour basculer en photo principale.
                </p>
                <div className="flex gap-2">
                  {extraResults.map((r) => {
                    const label = POSES.find((p) => p.id === r.pose)?.label ?? r.pose;
                    return (
                      <button
                        key={r.id}
                        onClick={() => selectExtraResult(r)}
                        className="relative w-20 h-24 rounded-lg overflow-hidden border border-border hover:border-accent transition-colors"
                        title={`Voir la pose ${label}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={r.url} alt={label} className="w-full h-full object-cover" />
                        <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] py-0.5 text-center">
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Description card */}
          {(description || descriptionError) && (
            <div className="rounded-xl bg-surface border border-border p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-accent" />
                  <h2 className="text-sm font-semibold text-foreground">Fiche produit Shopify</h2>
                </div>
                {description && (
                  <div className="flex items-center gap-1 rounded-md bg-background/50 border border-border p-0.5">
                    <button
                      onClick={() => setActiveLang("en")}
                      className={`px-2.5 py-1 text-[11px] rounded ${
                        activeLang === "en" ? "bg-accent text-foreground" : "text-foreground-muted"
                      }`}
                    >
                      EN
                    </button>
                    <button
                      onClick={() => setActiveLang("ar")}
                      className={`px-2.5 py-1 text-[11px] rounded ${
                        activeLang === "ar" ? "bg-accent text-foreground" : "text-foreground-muted"
                      }`}
                    >
                      ع
                    </button>
                  </div>
                )}
              </div>

              {descriptionError && (
                <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 px-3 py-2 rounded-lg mb-3">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>Description non générée: {descriptionError}</span>
                </div>
              )}

              {currentLoc && (
                <div
                  className="space-y-4"
                  dir={activeLang === "ar" ? "rtl" : "ltr"}
                >
                  <Field
                    label="Title (product page)"
                    value={currentLoc.title}
                    copyKey={`${activeLang}-title`}
                    copiedKey={copiedKey}
                    onCopy={copyText}
                  />
                  <Field
                    label="Description"
                    value={currentLoc.description}
                    multiline
                    copyKey={`${activeLang}-desc`}
                    copiedKey={copiedKey}
                    onCopy={copyText}
                  />
                  <Field
                    label="Page title (SEO)"
                    value={currentLoc.pageTitle}
                    copyKey={`${activeLang}-ptitle`}
                    copiedKey={copiedKey}
                    onCopy={copyText}
                  />
                  <Field
                    label="Meta description (SEO)"
                    value={currentLoc.metaDescription}
                    copyKey={`${activeLang}-meta`}
                    copiedKey={copiedKey}
                    onCopy={copyText}
                  />
                </div>
              )}

              {description && (
                <div className="mt-4 pt-4 border-t border-border space-y-4" dir="ltr">
                  <Field
                    label="URL handle"
                    value={description.urlHandle}
                    copyKey="urlhandle"
                    copiedKey={copiedKey}
                    onCopy={copyText}
                  />
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[11px] uppercase tracking-wider text-foreground-subtle">
                        Tags Shopify
                      </label>
                      <button
                        onClick={() => copyText("tags", description.tags.join(", "))}
                        className="text-foreground-subtle hover:text-accent"
                      >
                        {copiedKey === "tags" ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {description.tags.map((t, i) => (
                        <span
                          key={i}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {resultUrl && description && (
            <MarketingPackBox
              pack={marketingPack}
              loading={marketingLoading}
              error={marketingError}
              lang={marketingLang}
              onLangChange={setMarketingLang}
              onGenerate={generateMarketing}
              copiedKey={copiedKey}
              onCopy={copyText}
            />
          )}

          {resultUrl && description && (
            <StoryPosterBox
              posterUrl={storyPosterUrl}
              loading={storyLoading}
              error={storyError}
              onGenerate={generateStory}
              onDownload={downloadStory}
            />
          )}

          {resultUrl && description && (
            <ShopifyPushBox
              generationId={resultId}
              inlineImage={resultUrl}
              inlineExtraImages={extraResults.map((r) => ({
                id: r.id,
                url: r.url,
                label: POSES.find((p) => p.id === r.pose)?.label ?? r.pose,
              }))}
              inlineDescription={description}
              inlineSku={sku.trim() || null}
              onReset={resetForNewProduct}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function MarketingPackBox({
  pack,
  loading,
  error,
  lang,
  onLangChange,
  onGenerate,
  copiedKey,
  onCopy,
}: {
  pack: MarketingPack | null;
  loading: boolean;
  error: string | null;
  lang: "en" | "ar";
  onLangChange: (l: "en" | "ar") => void;
  onGenerate: () => void;
  copiedKey: string | null;
  onCopy: (key: string, val: string) => void;
}) {
  const ig = pack?.instagram[lang];
  const wa = pack?.whatsapp[lang];
  const reel = pack?.reel.ar;
  const dir = lang === "ar" ? "rtl" : "ltr";

  function reelFullText(r: ReelScript): string {
    const lines = [
      `Hook (0-2s) — ${r.hook}`,
      ...r.scenes.map(
        (s, i) =>
          `Scène ${i + 1} — ${s.shot}\n  Action: ${s.action}\n  Texte écran: ${s.onScreenText}\n  Voix off: ${s.voiceOver}`,
      ),
      `CTA — ${r.cta}`,
      `Musique — ${r.musicMood}`,
    ];
    return lines.join("\n\n");
  }

  return (
    <div className="rounded-2xl bg-surface border border-border p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-semibold text-foreground">Pack Marketing</h2>
        </div>
        {pack && (
          <div className="flex items-center gap-1 rounded-lg bg-background border border-border p-1">
            <button
              onClick={() => onLangChange("en")}
              className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                lang === "en" ? "bg-accent text-foreground" : "text-foreground-muted hover:text-foreground"
              }`}
            >
              EN
            </button>
            <button
              onClick={() => onLangChange("ar")}
              className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                lang === "ar" ? "bg-accent text-foreground" : "text-foreground-muted hover:text-foreground"
              }`}
            >
              AR
            </button>
          </div>
        )}
      </div>

      {!pack && (
        <div>
          <p className="text-xs text-foreground-muted mb-4">
            Génère en 1 clic : caption Instagram, message WhatsApp Broadcast et script Reel/TikTok 15 sec — en anglais et arabe.
          </p>
          <button
            onClick={onGenerate}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Génération…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Générer le pack marketing
              </>
            )}
          </button>
          {error && (
            <div className="mt-3 flex items-start gap-2 text-xs text-red-400">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}

      {pack && (
        <div className="space-y-6" dir={dir}>
          {/* Instagram */}
          {ig && (
            <div className="rounded-xl bg-background border border-border p-4">
              <div className="flex items-center gap-2 mb-3" dir="ltr">
                <AtSign className="w-4 h-4 text-pink-400" />
                <span className="text-xs font-semibold text-foreground">Instagram</span>
              </div>
              <Field
                label="Caption"
                value={ig.caption}
                multiline
                copyKey={`mkt-ig-cap-${lang}`}
                copiedKey={copiedKey}
                onCopy={onCopy}
              />
              <div className="mt-3" dir="ltr">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] uppercase tracking-wider text-foreground-subtle flex items-center gap-1">
                    <Hash className="w-3 h-3" /> Hashtags
                  </label>
                  <button
                    onClick={() => onCopy(`mkt-ig-tags-${lang}`, ig.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" "))}
                    className="text-foreground-subtle hover:text-accent"
                  >
                    {copiedKey === `mkt-ig-tags-${lang}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ig.hashtags.map((t, i) => (
                    <span
                      key={i}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-pink-500/10 text-pink-300 border border-pink-500/20"
                    >
                      #{t.replace(/^#/, "")}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* WhatsApp */}
          {wa && (
            <div className="rounded-xl bg-background border border-border p-4">
              <div className="flex items-center gap-2 mb-3" dir="ltr">
                <MessageCircle className="w-4 h-4 text-green-400" />
                <span className="text-xs font-semibold text-foreground">WhatsApp Broadcast</span>
              </div>
              <Field
                label="Message"
                value={wa}
                multiline
                copyKey={`mkt-wa-${lang}`}
                copiedKey={copiedKey}
                onCopy={onCopy}
              />
            </div>
          )}

          {/* Reel — toujours en arabe */}
          {reel && (
            <div className="rounded-xl bg-background border border-border p-4" dir="ltr">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-semibold text-foreground">Reel / TikTok 15s</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">AR</span>
                </div>
                <button
                  onClick={() => onCopy("mkt-reel-full", reelFullText(reel))}
                  className="text-[11px] text-foreground-subtle hover:text-accent inline-flex items-center gap-1"
                >
                  {copiedKey === "mkt-reel-full" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  Copier le script complet
                </button>
              </div>
              <div className="space-y-3">
                <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-purple-300 mb-1">Hook (0-2s)</p>
                  <p className="text-sm text-foreground font-medium" dir="rtl">{reel.hook}</p>
                </div>
                {reel.scenes.map((s, i) => (
                  <div key={i} className="rounded-lg bg-surface border border-border p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] uppercase tracking-wider text-foreground-subtle">Scène {i + 1}</p>
                      <p className="text-[10px] text-foreground-subtle" dir="rtl">{s.shot}</p>
                    </div>
                    <p className="text-xs text-foreground-muted mb-2" dir="rtl">{s.action}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      <div className="rounded bg-background/50 px-2 py-1.5">
                        <span className="text-[10px] text-foreground-subtle block">Texte écran</span>
                        <span className="text-foreground block" dir="rtl">{s.onScreenText}</span>
                      </div>
                      <div className="rounded bg-background/50 px-2 py-1.5">
                        <span className="text-[10px] text-foreground-subtle block">Voix off</span>
                        <span className="text-foreground block" dir="rtl">{s.voiceOver}</span>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="rounded-lg bg-accent/10 border border-accent/20 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-accent mb-1">CTA final</p>
                  <p className="text-sm text-foreground font-medium" dir="rtl">{reel.cta}</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-foreground-muted">
                  <Music2 className="w-3.5 h-3.5 text-foreground-subtle" />
                  <span className="text-[11px] uppercase tracking-wider text-foreground-subtle">Musique :</span>
                  <span dir="rtl">{reel.musicMood}</span>
                </div>
              </div>
            </div>
          )}

          <div dir="ltr">
            <button
              onClick={onGenerate}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-xs text-foreground-muted hover:text-foreground hover:border-accent disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Régénérer le pack
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StoryPosterBox({
  posterUrl,
  loading,
  error,
  onGenerate,
  onDownload,
}: {
  posterUrl: string | null;
  loading: boolean;
  error: string | null;
  onGenerate: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="rounded-2xl bg-surface border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-semibold text-foreground">Affiche Story Instagram</h2>
        </div>
        {posterUrl && (
          <div className="flex items-center gap-2">
            <button
              onClick={onGenerate}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs text-foreground-muted hover:text-foreground hover:border-accent disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Régénérer
            </button>
            <button
              onClick={onDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-foreground text-xs font-medium hover:opacity-90"
            >
              <Download className="w-3.5 h-3.5" />
              Télécharger
            </button>
          </div>
        )}
      </div>

      {!posterUrl && (
        <div>
          <p className="text-xs text-foreground-muted mb-4">
            Affiche verticale 9:16 (1080×1920) prête à publier en Story Instagram, avec ta marque et le nom du produit. La génération prend ~20 secondes.
          </p>
          <button
            onClick={onGenerate}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Génération…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Générer l&apos;affiche Story
              </>
            )}
          </button>
          {error && (
            <div className="mt-3 flex items-start gap-2 text-xs text-red-400">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}

      {posterUrl && (
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={posterUrl}
            alt="Affiche Story Instagram"
            className="max-h-[600px] w-auto rounded-lg border border-border"
          />
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  multiline,
  copyKey,
  copiedKey,
  onCopy,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  copyKey: string;
  copiedKey: string | null;
  onCopy: (key: string, val: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11px] uppercase tracking-wider text-foreground-subtle">{label}</label>
        <button
          onClick={() => onCopy(copyKey, value)}
          className="text-foreground-subtle hover:text-accent"
        >
          {copiedKey === copyKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      <p
        className={`text-sm text-foreground leading-relaxed ${
          multiline ? "whitespace-pre-line" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function parseInlineImage(
  dataUrl: string | undefined,
): { base64: string; mimeType: string } | null {
  if (!dataUrl) return null;
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

async function compressInlineImage(
  dataUrl: string,
  maxDimension = 2048,
  quality = 0.85,
): Promise<{ base64: string; mimeType: string } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(parseInlineImage(dataUrl));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const out = canvas.toDataURL("image/jpeg", quality);
      resolve(parseInlineImage(out));
    };
    img.onerror = () => resolve(parseInlineImage(dataUrl));
    img.src = dataUrl;
  });
}

function ShopifyPushBox({
  generationId,
  inlineImage,
  inlineExtraImages,
  inlineDescription,
  inlineSku,
  compact,
  onReset,
}: {
  generationId: string | null;
  inlineImage?: string;
  inlineExtraImages?: Array<{ id: string; url: string; label?: string }>;
  inlineDescription?: ProductDescription | null;
  inlineSku?: string | null;
  compact?: boolean;
  onReset?: () => void;
}) {
  const allImages: Array<{ id: string; url: string; label?: string }> = [
    ...(inlineImage && generationId ? [{ id: generationId, url: inlineImage, label: "Photo principale" }] : []),
    ...(inlineExtraImages ?? []),
  ];
  const allImageIds = allImages.map((i) => i.id).join(",");
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(
    () => new Set(allImages.map((i) => i.id)),
  );
  useEffect(() => {
    setSelectedImageIds(new Set(allImages.map((i) => i.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allImageIds]);

  function toggleImage(id: string) {
    setSelectedImageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }
  const [mode, setMode] = useState<"new" | "variant">("new");

  const [collections, setCollections] = useState<ShopifyCollection[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [price, setPrice] = useState("");
  const [inventoryQty, setInventoryQty] = useState("5");
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);

  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<ShopifyProductLite[]>([]);
  const [productSearching, setProductSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ShopifyProductLite | null>(null);
  const [colorName, setColorName] = useState("");
  const [variantSku, setVariantSku] = useState("");

  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PushResult | AddVariantResult | null>(null);
  const [resultMode, setResultMode] = useState<"new" | "variant">("new");

  useEffect(() => {
    let cancelled = false;
    setCollectionsLoading(true);
    fetch("/api/shopify/collections")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data.collections)) setCollections(data.collections);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setCollectionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (mode !== "variant") return;
    let cancelled = false;
    const t = setTimeout(() => {
      setProductSearching(true);
      fetch(`/api/shopify/products?q=${encodeURIComponent(productQuery)}`)
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          if (Array.isArray(data.products)) setProductResults(data.products);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setProductSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [mode, productQuery]);

  function toggleCollection(id: string) {
    setSelectedCollections((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  async function pushNewProduct() {
    if (!price.trim()) {
      setError("Renseigne un prix");
      return;
    }
    if (!inlineDescription && !generationId) {
      setError("Aucune fiche produit disponible");
      return;
    }
    setPushing(true);
    setError(null);
    setResult(null);
    try {
      const selectedUrls = allImages
        .filter((img) => selectedImageIds.has(img.id))
        .map((img) => img.url);

      const compressed = await Promise.all(selectedUrls.map((url) => compressInlineImage(url)));
      const selectedInlineImages = compressed.filter(
        (p): p is { base64: string; mimeType: string } => p !== null,
      );

      if (selectedInlineImages.length === 0 && allImages.length > 0) {
        throw new Error("Sélectionne au moins une photo");
      }

      // Vercel rejects request bodies > 4.5 MB. JPEG compression keeps each image small, but cap to be safe.
      const totalBase64Bytes = selectedInlineImages.reduce((sum, img) => sum + img.base64.length, 0);
      if (totalBase64Bytes > 4_000_000) {
        throw new Error(
          `Photos encore trop lourdes après compression (${(totalBase64Bytes / 1_000_000).toFixed(1)} Mo). Décoche-en une et réessaie, ou ajoute-les manuellement dans Shopify Admin après la création.`,
        );
      }

      const parsedQty = parseInt(inventoryQty.trim(), 10);
      const res = await fetch("/api/shopify/push-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationId,
          price: price.trim(),
          collectionIds: selectedCollections,
          images: selectedInlineImages,
          description: inlineDescription ?? undefined,
          sku: inlineSku ?? undefined,
          inventoryQuantity: Number.isFinite(parsedQty) && parsedQty >= 0 ? parsedQty : 5,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Échec du push Shopify");
      setResultMode("new");
      setResult(data as PushResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setPushing(false);
    }
  }

  async function pushVariant() {
    if (!selectedProduct) {
      setError("Choisis un produit existant");
      return;
    }
    if (!colorName.trim()) {
      setError("Renseigne le nom de la couleur");
      return;
    }
    if (!price.trim()) {
      setError("Renseigne un prix");
      return;
    }
    setPushing(true);
    setError(null);
    setResult(null);
    try {
      const inlineParts = parseInlineImage(inlineImage);
      const res = await fetch("/api/shopify/add-variant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationId,
          productId: selectedProduct.id,
          colorName: colorName.trim(),
          price: price.trim(),
          sku: variantSku.trim() || undefined,
          imageBase64: inlineParts?.base64,
          imageMimeType: inlineParts?.mimeType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Échec de l'ajout de variante");
      setResultMode("variant");
      setResult(data as AddVariantResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setPushing(false);
    }
  }

  if (result) {
    const isVariant = resultMode === "variant";
    return (
      <div className="rounded-xl bg-surface border border-green-500/30 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Check className="w-4 h-4 text-green-400" />
          <h3 className="text-sm font-semibold text-foreground">
            {isVariant
              ? "Variante ajoutée au produit existant"
              : "Produit créé en brouillon sur Shopify"}
          </h3>
        </div>
        <p className="text-xs text-foreground-muted">
          {isVariant
            ? "La nouvelle couleur est ajoutée. Vérifie l'ordre des variantes et l'image principale dans Shopify."
            : "Va dans ton admin pour vérifier les variantes, valider le prix et publier."}
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={result.adminUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent text-foreground text-xs font-medium hover:bg-accent/90"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Ouvrir dans Shopify
          </a>
          {onReset && (
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setError(null);
                setPrice("");
                setSelectedCollections([]);
                setSelectedProduct(null);
                setColorName("");
                setVariantSku("");
                setProductQuery("");
                setMode("new");
                onReset();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface border border-border text-foreground text-xs font-medium hover:border-accent/50 hover:text-accent"
            >
              <Plus className="w-3.5 h-3.5" />
              Créer un autre produit
            </button>
          )}
        </div>
        {result.warnings.length > 0 && (
          <div className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 space-y-1">
            <p className="font-medium">Quelques avertissements :</p>
            {result.warnings.map((w, i) => (
              <p key={i}>· {w}</p>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-xl bg-surface border border-border p-${compact ? "4" : "6"} space-y-4`}>
      {!compact && (
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-semibold text-foreground">Push vers Shopify</h2>
        </div>
      )}

      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-background border border-border p-1">
        <button
          onClick={() => {
            setMode("new");
            setError(null);
          }}
          className={`px-3 py-2 text-xs rounded-md transition-colors ${
            mode === "new"
              ? "bg-accent text-foreground font-medium"
              : "text-foreground-muted hover:text-foreground"
          }`}
        >
          Nouveau produit
        </button>
        <button
          onClick={() => {
            setMode("variant");
            setError(null);
          }}
          className={`px-3 py-2 text-xs rounded-md transition-colors ${
            mode === "variant"
              ? "bg-accent text-foreground font-medium"
              : "text-foreground-muted hover:text-foreground"
          }`}
        >
          Variante (couleur)
        </button>
      </div>

      {mode === "variant" && (
        <>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-foreground-subtle mb-1.5 block">
              Produit existant
            </label>
            {selectedProduct ? (
              <div className="flex items-center gap-3 rounded-lg bg-background border border-border p-2">
                {selectedProduct.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedProduct.imageUrl}
                    alt=""
                    className="w-10 h-10 rounded object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded bg-surface-muted" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground truncate">{selectedProduct.title}</p>
                  <p className="text-[10px] text-foreground-subtle">
                    Options:{" "}
                    {selectedProduct.options.map((o) => o.name).join(", ") || "aucune"}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="text-foreground-subtle hover:text-foreground text-xs"
                >
                  Changer
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  placeholder="Rechercher par titre ou SKU..."
                  className="w-full rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-accent/50 mb-2"
                />
                <div className="max-h-48 overflow-y-auto rounded-lg bg-background border border-border">
                  {productSearching && productResults.length === 0 ? (
                    <div className="text-xs text-foreground-subtle p-3">Recherche...</div>
                  ) : productResults.length === 0 ? (
                    <div className="text-xs text-foreground-subtle p-3">
                      Aucun produit trouvé
                    </div>
                  ) : (
                    productResults.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedProduct(p)}
                        className="w-full flex items-center gap-2 p-2 hover:bg-surface-muted text-left"
                      >
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.imageUrl}
                            alt=""
                            className="w-8 h-8 rounded object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded bg-surface-muted shrink-0" />
                        )}
                        <span className="text-xs text-foreground truncate">{p.title}</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider text-foreground-subtle mb-1.5 block">
              Nom de la couleur
            </label>
            <input
              type="text"
              value={colorName}
              onChange={(e) => setColorName(e.target.value)}
              placeholder="Olive, Noir, Bordeaux, Ivoire..."
              className="w-full rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-accent/50"
            />
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider text-foreground-subtle mb-1.5 block">
              SKU variante (optionnel)
            </label>
            <input
              type="text"
              value={variantSku}
              onChange={(e) => setVariantSku(e.target.value.toUpperCase())}
              placeholder="A122-OLV (laisser vide = SKU de la génération)"
              className="w-full rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-accent/50"
            />
          </div>
        </>
      )}

      {mode === "new" && allImages.length > 1 && (
        <div>
          <label className="text-[11px] uppercase tracking-wider text-foreground-subtle mb-1.5 block">
            Photos à inclure ({selectedImageIds.size}/{allImages.length})
          </label>
          <div className="grid grid-cols-4 gap-2">
            {allImages.map((img) => {
              const isSelected = selectedImageIds.has(img.id);
              return (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => toggleImage(img.id)}
                  className={`relative rounded-lg overflow-hidden border-2 transition-all aspect-[3/4] ${
                    isSelected ? "border-accent" : "border-border opacity-50 hover:opacity-80"
                  }`}
                  title={img.label ?? "Photo"}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.label ?? ""} className="w-full h-full object-cover" />
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-background/80 border border-border flex items-center justify-center">
                    {isSelected && <Check className="w-3 h-3 text-accent" />}
                  </span>
                  {img.label && (
                    <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] py-0.5 text-center truncate">
                      {img.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <label className="text-[11px] uppercase tracking-wider text-foreground-subtle mb-1.5 block">
          Prix (KWD)
        </label>
        <input
          type="text"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="45.000"
          className="w-full rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-accent/50"
        />
      </div>

      {mode === "new" && (
        <div>
          <label className="text-[11px] uppercase tracking-wider text-foreground-subtle mb-1.5 block">
            Quantité initiale par variante
          </label>
          <input
            type="number"
            min={0}
            step={1}
            value={inventoryQty}
            onChange={(e) => setInventoryQty(e.target.value)}
            placeholder="5"
            className="w-full rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-accent/50"
          />
          <p className="mt-1 text-[11px] text-foreground-subtle">
            Stock seedé sur chaque variante à ton emplacement Shopify (modifiable après création).
          </p>
        </div>
      )}

      {mode === "new" && (
        <div>
          <label className="text-[11px] uppercase tracking-wider text-foreground-subtle mb-1.5 block">
            Collections {selectedCollections.length > 0 && `(${selectedCollections.length})`}
          </label>
          {collectionsLoading ? (
            <div className="text-xs text-foreground-subtle py-2">Chargement...</div>
          ) : collections.length === 0 ? (
            <div className="text-xs text-foreground-subtle py-2">Aucune collection trouvée</div>
          ) : (
            <div className="max-h-32 overflow-y-auto rounded-lg bg-background border border-border p-2 space-y-0.5">
              {collections.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-muted cursor-pointer text-xs text-foreground-muted"
                >
                  <input
                    type="checkbox"
                    checked={selectedCollections.includes(c.id)}
                    onChange={() => toggleCollection(c.id)}
                    className="w-3.5 h-3.5 accent-accent"
                  />
                  {c.title}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button
        onClick={mode === "new" ? pushNewProduct : pushVariant}
        disabled={
          pushing ||
          !price.trim() ||
          (mode === "variant" && (!selectedProduct || !colorName.trim()))
        }
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-foreground text-sm font-semibold hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {pushing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {mode === "new" ? "Création..." : "Ajout de la variante..."}
          </>
        ) : mode === "new" ? (
          <>
            <ShoppingBag className="w-4 h-4" />
            Créer en brouillon (EN + AR)
          </>
        ) : (
          <>
            <ShoppingBag className="w-4 h-4" />
            Ajouter la variante {colorName && `« ${colorName} »`}
          </>
        )}
      </button>

      <p className="text-[11px] text-foreground-subtle">
        {mode === "new"
          ? "Le produit est créé en brouillon avec les traductions arabes (Translate & Adapt). Tu valides et publies depuis Shopify Admin."
          : "La variante est ajoutée immédiatement au produit existant. Si l'option 'Color' n'existe pas encore, elle est créée automatiquement."}
      </p>
    </div>
  );
}
