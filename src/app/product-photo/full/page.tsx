"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Upload,
  Loader2,
  AlertCircle,
  Trash2,
  Plus,
  ArrowLeft,
  ShoppingBag,
  ExternalLink,
  RefreshCw,
  Check,
} from "lucide-react";

type ColorRow = {
  id: string;
  name: string;
  file: File | null;
  previewUrl: string | null;
  base64: string | null;
  mimeType: string | null;
};

type ShopifyCollection = { id: string; title: string; handle: string };

type CreateResult = {
  productId: string;
  productHandle: string;
  adminUrl: string;
  mainColor: string;
  variantResults: Array<{ color: string; variantId?: string; error?: string }>;
  warnings: string[];
};

const STORE_DOMAIN = "bluemarineatelier.com";

function newRow(): ColorRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    file: null,
    previewUrl: null,
    base64: null,
    mimeType: null,
  };
}

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

async function compressImage(
  file: File,
): Promise<{ base64: string; mimeType: string; previewUrl: string }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Image illisible"));
      image.src = objectUrl;
    });

    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponible");
    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    const match = /^data:(.+?);base64,(.+)$/.exec(dataUrl);
    if (!match) throw new Error("Compression échouée");
    return { mimeType: match[1], base64: match[2], previewUrl: dataUrl };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function FullProductPage() {
  const [sku, setSku] = useState("");
  const [skuLoading, setSkuLoading] = useState(false);
  const [skuTouched, setSkuTouched] = useState(false);
  const [price, setPrice] = useState("45.000");
  const [pieces, setPieces] = useState<1 | 2 | 3 | 4>(1);
  const [hasShawl, setHasShawl] = useState(false);
  const [collections, setCollections] = useState<ShopifyCollection[]>([]);
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [colors, setColors] = useState<ColorRow[]>([newRow(), newRow()]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResult | null>(null);

  async function fetchNextSku(opts?: { force?: boolean }) {
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
    fetchNextSku();
    fetch("/api/shopify/collections")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.collections)) setCollections(d.collections);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function setColorFile(rowId: string, file: File) {
    try {
      const { base64, mimeType, previewUrl } = await compressImage(file);
      setColors((prev) =>
        prev.map((c) =>
          c.id === rowId ? { ...c, file, previewUrl, base64, mimeType } : c,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur fichier");
    }
  }

  function updateColorName(rowId: string, name: string) {
    setColors((prev) => prev.map((c) => (c.id === rowId ? { ...c, name } : c)));
  }

  function removeColor(rowId: string) {
    setColors((prev) => (prev.length > 1 ? prev.filter((c) => c.id !== rowId) : prev));
  }

  function addColor() {
    setColors((prev) => [...prev, newRow()]);
  }

  function toggleCollection(id: string) {
    setSelectedCollections((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function reset() {
    setColors([newRow(), newRow()]);
    setResult(null);
    setError(null);
    setSelectedCollections([]);
    setHasShawl(false);
    setPieces(1);
    fetchNextSku({ force: true });
  }

  const validColors = colors.filter(
    (c) => c.name.trim() && c.base64 && c.mimeType,
  );
  const canSubmit =
    !submitting &&
    sku.trim().length > 0 &&
    /^\d+(\.\d{1,3})?$/.test(price.trim()) &&
    validColors.length >= 1;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/shopify/create-product-full", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: sku.trim().toUpperCase(),
          price: price.trim(),
          pieces,
          hasShawl,
          collectionIds: selectedCollections,
          colors: validColors.map((c) => ({
            name: c.name.trim(),
            imageBase64: c.base64,
            imageMimeType: c.mimeType,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Échec de la création");
      setResult(data as CreateResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex-1 overflow-auto">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md px-8 py-5">
        <div className="flex items-center gap-3">
          <Link
            href="/product-photo"
            className="text-foreground-muted hover:text-foreground"
            aria-label="Retour"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <ShoppingBag className="w-5 h-5 text-accent" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Produit complet</h1>
            <p className="text-sm text-foreground-muted mt-0.5">
              Créez un produit avec toutes ses couleurs en une fois — vraies photos, fiche FR + AR auto
            </p>
          </div>
        </div>
      </header>

      <div className="p-8 grid lg:grid-cols-2 gap-6 max-w-7xl">
        <div className="space-y-6">
          <div className="rounded-xl bg-surface border border-border p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">1. Informations produit</h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-foreground-subtle mb-1.5 block">
                  SKU
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => {
                      setSku(e.target.value.toUpperCase());
                      setSkuTouched(true);
                    }}
                    placeholder="A123"
                    className="flex-1 rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-accent/50"
                  />
                  <button
                    type="button"
                    onClick={() => fetchNextSku({ force: true })}
                    disabled={skuLoading}
                    className="px-2 rounded-lg bg-background border border-border text-foreground-muted hover:text-foreground disabled:opacity-50"
                    title="Suggérer le prochain SKU"
                  >
                    {skuLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

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
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-foreground-subtle mb-1.5 block">
                  Nombre de pièces
                </label>
                <select
                  value={pieces}
                  onChange={(e) => setPieces(Number(e.target.value) as 1 | 2 | 3 | 4)}
                  className="w-full rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent/50"
                >
                  <option value={1}>1 pièce (drâa, caftan, abaya...)</option>
                  <option value={2}>2 pièces (set)</option>
                  <option value={3}>3 pièces (set)</option>
                  <option value={4}>4 pièces (set)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-wider text-foreground-subtle mb-1.5 block">
                  Châle assorti ?
                </label>
                <button
                  type="button"
                  onClick={() => setHasShawl((v) => !v)}
                  className={`w-full rounded-lg px-3 py-2 text-sm border transition-colors ${
                    hasShawl
                      ? "border-accent bg-accent/10 text-foreground"
                      : "border-border bg-background text-foreground-muted hover:text-foreground"
                  }`}
                >
                  {hasShawl ? "✓ Oui, avec châle" : "Non"}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-surface border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">2. Couleurs ({validColors.length})</h2>
              <button
                type="button"
                onClick={addColor}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-background border border-border text-foreground-muted hover:text-foreground"
              >
                <Plus className="w-3 h-3" />
                Ajouter
              </button>
            </div>
            <p className="text-[11px] text-foreground-subtle mb-3">
              La 1ʳᵉ couleur devient la photo principale du produit. Les autres deviennent des variantes.
            </p>
            <div className="space-y-3">
              {colors.map((c, idx) => (
                <ColorRowEditor
                  key={c.id}
                  row={c}
                  index={idx}
                  isMain={idx === 0}
                  canDelete={colors.length > 1}
                  onName={(name) => updateColorName(c.id, name)}
                  onFile={(file) => setColorFile(c.id, file)}
                  onRemove={() => removeColor(c.id)}
                />
              ))}
            </div>
          </div>

          {collections.length > 0 && (
            <div className="rounded-xl bg-surface border border-border p-6">
              <h2 className="text-sm font-semibold text-foreground mb-4">
                3. Collections ({selectedCollections.length})
              </h2>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {collections.map((col) => {
                  const active = selectedCollections.includes(col.id);
                  return (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => toggleCollection(col.id)}
                      className={`text-left text-xs px-3 py-2 rounded-lg border transition-colors ${
                        active
                          ? "border-accent bg-accent/10 text-foreground"
                          : "border-border bg-background text-foreground-muted hover:text-foreground"
                      }`}
                    >
                      {active && <Check className="inline w-3 h-3 mr-1" />}
                      {col.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent text-foreground font-medium py-3 text-sm hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Création en cours…
              </>
            ) : (
              <>
                <ShoppingBag className="w-4 h-4" />
                Créer le produit complet ({validColors.length}{" "}
                {validColors.length > 1 ? "couleurs" : "couleur"})
              </>
            )}
          </button>
          <p className="text-[11px] text-foreground-subtle text-center -mt-3">
            ⏱ Compter ~10-30 sec selon le nombre de couleurs.
          </p>
        </div>

        <div className="space-y-6">
          {!result && !submitting && (
            <div className="rounded-xl bg-surface border border-border p-6">
              <h3 className="text-sm font-semibold text-foreground mb-3">Comment ça marche</h3>
              <ol className="space-y-3 text-sm text-foreground-muted list-decimal list-inside">
                <li>Vous renseignez SKU, prix et infos de base</li>
                <li>Pour chaque couleur, vous saisissez le nom (ex: <em>Olive</em>) et uploadez sa vraie photo</li>
                <li>L&apos;IA Gemini analyse la photo principale et écrit la fiche complète : titre, description, SEO, tags — en français ET en arabe Khaleeji</li>
                <li>Le produit est créé sur Shopify avec :
                  <ul className="list-disc list-inside ml-4 mt-1 text-xs text-foreground-subtle">
                    <li>Tailles XS-3XL automatiques</li>
                    <li>Une variante par couleur, chacune avec sa vraie photo</li>
                    <li>Catégorie, poids, métadonnées Google Shopping</li>
                    <li>Traduction arabe automatique</li>
                  </ul>
                </li>
                <li>Le produit est <strong>publié immédiatement</strong> sur la boutique en ligne</li>
              </ol>
            </div>
          )}

          {submitting && (
            <div className="rounded-xl bg-surface border border-border p-6 text-center">
              <Loader2 className="w-8 h-8 mx-auto text-accent animate-spin mb-3" />
              <p className="text-sm text-foreground">Création en cours…</p>
              <p className="text-xs text-foreground-subtle mt-1">
                Génération fiche → push produit → ajout {validColors.length - 1} variante{validColors.length - 1 > 1 ? "s" : ""}
              </p>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Check className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-foreground">Produit créé !</h3>
                </div>
                <div className="space-y-2 text-sm">
                  <a
                    href={`https://${STORE_DOMAIN}/products/${result.productHandle}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-accent hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Voir sur la boutique
                  </a>
                  <a
                    href={result.adminUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-foreground-muted hover:text-foreground"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Ouvrir dans Shopify Admin
                  </a>
                </div>
              </div>

              <div className="rounded-xl bg-surface border border-border p-6">
                <h3 className="text-sm font-semibold text-foreground mb-3">Variantes couleur</h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2 text-foreground">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{result.mainColor}</span>
                    <span className="text-[10px] text-foreground-subtle">(principale)</span>
                  </li>
                  {result.variantResults.map((v) => (
                    <li
                      key={v.color}
                      className="flex items-center gap-2 text-sm"
                    >
                      {v.error ? (
                        <>
                          <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                          <span className="text-foreground">{v.color}</span>
                          <span className="text-[10px] text-red-400">{v.error}</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-foreground">{v.color}</span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {result.warnings.length > 0 && (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 text-xs text-amber-200/90 space-y-1">
                  <p className="font-medium text-amber-200">Avertissements :</p>
                  {result.warnings.map((w, i) => (
                    <p key={i}>• {w}</p>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={reset}
                className="w-full rounded-lg bg-surface border border-border py-2 text-sm text-foreground-muted hover:text-foreground hover:border-border-strong"
              >
                Créer un autre produit
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ColorRowEditor({
  row,
  index,
  isMain,
  canDelete,
  onName,
  onFile,
  onRemove,
}: {
  row: ColorRow;
  index: number;
  isMain: boolean;
  canDelete: boolean;
  onName: (name: string) => void;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="rounded-lg bg-background border border-border p-3 flex gap-3 items-start">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="shrink-0 w-20 h-24 rounded-md border-2 border-dashed border-border hover:border-accent/40 overflow-hidden flex items-center justify-center bg-surface-muted"
      >
        {row.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.previewUrl} alt={row.name} className="w-full h-full object-cover" />
        ) : (
          <Upload className="w-5 h-5 text-foreground-subtle" />
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
          }}
        />
      </button>

      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-foreground-subtle">
            Couleur {index + 1}
          </span>
          {isMain && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/15 text-accent">
              Principale
            </span>
          )}
        </div>
        <input
          type="text"
          value={row.name}
          onChange={(e) => onName(e.target.value)}
          placeholder={isMain ? "Olive (couleur principale)" : "Noir, Bordeaux, Ivoire..."}
          className="w-full rounded-md bg-surface border border-border px-2 py-1.5 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-accent/50"
        />
        {row.file && (
          <p className="text-[10px] text-foreground-subtle truncate">{row.file.name}</p>
        )}
      </div>

      {canDelete && (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 text-foreground-subtle hover:text-red-400 p-1"
          title="Supprimer cette couleur"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
