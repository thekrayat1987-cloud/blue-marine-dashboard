"use client";

import { useEffect, useState } from "react";
import {
  FolderPlus,
  Loader2,
  AlertCircle,
  Sparkles,
  Upload,
  RefreshCw,
  ImageIcon,
  Check,
  ExternalLink,
  Search,
} from "lucide-react";

type NameProposal = { enName: string; arName: string; rationale: string };
type Content = {
  bodyHtmlEn: string;
  bodyHtmlAr: string;
  seoTitleEn: string;
  seoTitleAr: string;
  seoDescEn: string;
  seoDescAr: string;
};
type ProductLite = {
  id: string;
  title: string;
  handle: string;
  imageUrl: string | null;
};
type CreateResult = {
  id: string;
  handle: string;
  adminUrl: string;
  storefrontUrl: string;
  steps: Array<{ name: string; ok: boolean; detail?: string }>;
};

const STEPS = [
  "Idée",
  "Nom",
  "Texte",
  "Image",
  "Produits",
  "Confirmation",
] as const;

export default function CollectionCreatorPage() {
  const [step, setStep] = useState<number>(0);

  // Step 1
  const [theme, setTheme] = useState("");
  const [refImage, setRefImage] = useState<{ base64: string; mime: string; preview: string } | null>(null);

  // Step 2
  const [proposals, setProposals] = useState<NameProposal[]>([]);
  const [enName, setEnName] = useState("");
  const [arName, setArName] = useState("");

  // Step 3
  const [content, setContent] = useState<Content | null>(null);

  // Step 4
  const [coverBase64, setCoverBase64] = useState<string | null>(null);
  const [coverPrompt, setCoverPrompt] = useState("");

  // Step 5
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<ProductLite[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<ProductLite[]>([]);

  // Step 6
  const [addToHomepage, setAddToHomepage] = useState(true);
  const [addToNavMenu, setAddToNavMenu] = useState(true);

  // Result
  const [createResult, setCreateResult] = useState<CreateResult | null>(null);

  // Async state
  const [loadingNames, setLoadingNames] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [loadingCover, setLoadingCover] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function onPickImage(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] || "";
      setRefImage({ base64, mime: file.type, preview: result });
    };
    reader.readAsDataURL(file);
  }

  async function fetchNames() {
    setLoadingNames(true);
    setErr(null);
    try {
      const res = await fetch("/api/collections/suggest-names", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme,
          referenceImageBase64: refImage?.base64,
          referenceImageMime: refImage?.mime,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `${res.status}`);
      setProposals(j.proposals || []);
      setStep(1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoadingNames(false);
    }
  }

  async function fetchContent() {
    setLoadingContent(true);
    setErr(null);
    try {
      const res = await fetch("/api/collections/suggest-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enName, arName, theme }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `${res.status}`);
      setContent(j.content);
      setStep(2);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoadingContent(false);
    }
  }

  async function fetchCover() {
    setLoadingCover(true);
    setErr(null);
    try {
      const res = await fetch("/api/collections/generate-cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enName, theme, vibePrompt: coverPrompt || undefined }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `${res.status}`);
      setCoverBase64(j.coverBase64);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoadingCover(false);
    }
  }

  async function searchProducts(q: string) {
    setLoadingProducts(true);
    try {
      const res = await fetch(`/api/shopify/products?q=${encodeURIComponent(q)}`);
      const j = await res.json();
      setProductResults(j.products || []);
    } catch {
      setProductResults([]);
    } finally {
      setLoadingProducts(false);
    }
  }

  // Search debounce
  useEffect(() => {
    if (step !== 4) return;
    const t = setTimeout(() => searchProducts(productSearch), 250);
    return () => clearTimeout(t);
  }, [productSearch, step]);

  function toggleProduct(p: ProductLite) {
    setSelectedProducts((cur) =>
      cur.some((x) => x.id === p.id) ? cur.filter((x) => x.id !== p.id) : [...cur, p],
    );
  }

  async function submitCreate() {
    if (!content) return;
    setCreating(true);
    setErr(null);
    try {
      const res = await fetch("/api/collections/create-full", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enName,
          arName,
          ...content,
          productIds: selectedProducts.map((p) => p.id),
          coverImageBase64: coverBase64 || undefined,
          addToHomepage,
          addToNavMenu,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `${res.status}`);
      setCreateResult(j.result);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex-1 overflow-auto">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md px-8 py-5">
        <div className="flex items-center gap-3">
          <FolderPlus className="w-5 h-5 text-accent" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Créer une collection</h1>
            <p className="text-sm text-foreground-muted mt-0.5">
              Donne-moi une idée ou une image, je te guide à chaque étape
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4 overflow-x-auto">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`flex items-center gap-2 px-3 py-1 rounded-lg text-xs whitespace-nowrap ${
                i === step
                  ? "bg-accent text-foreground"
                  : i < step
                    ? "bg-accent/15 text-accent"
                    : "bg-surface text-foreground-subtle"
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-black/20 text-[10px] flex items-center justify-center">
                {i < step ? <Check className="w-3 h-3" /> : i + 1}
              </span>
              {s}
            </div>
          ))}
        </div>
      </header>

      <div className="p-8 max-w-4xl space-y-6">
        {err && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{err}</span>
          </div>
        )}

        {createResult ? (
          <ResultPanel result={createResult} />
        ) : (
          <>
            {step === 0 && (
              <Card title="1. L'idée derrière la collection">
                <p className="text-xs text-foreground-subtle mb-3">
                  Décris en quelques mots ce que tu veux. Tu peux aussi ajouter une image
                  d&apos;inspiration (optionnel).
                </p>
                <textarea
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  rows={4}
                  placeholder="Ex : un thème été voyage côtier, des pièces fluides en pastel"
                  className="w-full rounded-lg bg-background border border-border p-3 text-sm focus:border-accent outline-none"
                />
                <div className="mt-3">
                  {refImage ? (
                    <div className="relative inline-block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={refImage.preview}
                        alt="référence"
                        className="h-32 w-auto rounded-lg border border-border"
                      />
                      <button
                        onClick={() => setRefImage(null)}
                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-black/70 text-white text-xs"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <label className="inline-flex items-center gap-2 cursor-pointer text-xs px-3 py-2 rounded-lg border border-border hover:border-accent/40 transition-colors">
                      <Upload className="w-3.5 h-3.5" />
                      Ajouter une image d&apos;inspiration
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && onPickImage(e.target.files[0])}
                      />
                    </label>
                  )}
                </div>
                <div className="mt-4 flex justify-end">
                  <PrimaryButton
                    disabled={!theme.trim() || loadingNames}
                    onClick={fetchNames}
                  >
                    {loadingNames ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Génération…
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Proposer des noms
                      </>
                    )}
                  </PrimaryButton>
                </div>
              </Card>
            )}

            {step === 1 && (
              <Card title="2. Choisis un nom (ou écris le tien)">
                <div className="space-y-2 mb-4">
                  {proposals.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setEnName(p.enName);
                        setArName(p.arName);
                      }}
                      className={`w-full text-left rounded-lg border p-3 transition-colors ${
                        enName === p.enName
                          ? "border-accent bg-accent/10"
                          : "border-border hover:border-accent/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">{p.enName}</div>
                          <div className="text-sm text-foreground-muted" dir="rtl">
                            {p.arName}
                          </div>
                        </div>
                        {enName === p.enName && <Check className="w-4 h-4 text-accent" />}
                      </div>
                      <div className="text-xs text-foreground-subtle mt-2">{p.rationale}</div>
                    </button>
                  ))}
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Nom EN">
                    <input
                      value={enName}
                      onChange={(e) => setEnName(e.target.value)}
                      className="w-full rounded-lg bg-background border border-border p-2 text-sm focus:border-accent outline-none"
                    />
                  </Field>
                  <Field label="Nom AR">
                    <input
                      value={arName}
                      onChange={(e) => setArName(e.target.value)}
                      dir="rtl"
                      className="w-full rounded-lg bg-background border border-border p-2 text-sm focus:border-accent outline-none"
                    />
                  </Field>
                </div>
                <div className="mt-4 flex justify-between">
                  <SecondaryButton onClick={() => setStep(0)}>← Retour</SecondaryButton>
                  <PrimaryButton
                    disabled={!enName.trim() || !arName.trim() || loadingContent}
                    onClick={fetchContent}
                  >
                    {loadingContent ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Génération…
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Générer description + SEO
                      </>
                    )}
                  </PrimaryButton>
                </div>
              </Card>
            )}

            {step === 2 && content && (
              <Card title="3. Description & SEO (édite si tu veux)">
                <div className="space-y-4">
                  <Field label="Description EN">
                    <textarea
                      value={content.bodyHtmlEn}
                      onChange={(e) => setContent({ ...content, bodyHtmlEn: e.target.value })}
                      rows={3}
                      className="w-full rounded-lg bg-background border border-border p-2 text-sm font-mono focus:border-accent outline-none"
                    />
                  </Field>
                  <Field label="Description AR">
                    <textarea
                      value={content.bodyHtmlAr}
                      onChange={(e) => setContent({ ...content, bodyHtmlAr: e.target.value })}
                      rows={3}
                      dir="rtl"
                      className="w-full rounded-lg bg-background border border-border p-2 text-sm font-mono focus:border-accent outline-none"
                    />
                  </Field>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Field label="SEO titre EN">
                      <input
                        value={content.seoTitleEn}
                        onChange={(e) => setContent({ ...content, seoTitleEn: e.target.value })}
                        className="w-full rounded-lg bg-background border border-border p-2 text-sm focus:border-accent outline-none"
                      />
                    </Field>
                    <Field label="SEO titre AR">
                      <input
                        value={content.seoTitleAr}
                        onChange={(e) => setContent({ ...content, seoTitleAr: e.target.value })}
                        dir="rtl"
                        className="w-full rounded-lg bg-background border border-border p-2 text-sm focus:border-accent outline-none"
                      />
                    </Field>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Field label="SEO description EN">
                      <textarea
                        value={content.seoDescEn}
                        onChange={(e) => setContent({ ...content, seoDescEn: e.target.value })}
                        rows={2}
                        className="w-full rounded-lg bg-background border border-border p-2 text-sm focus:border-accent outline-none"
                      />
                    </Field>
                    <Field label="SEO description AR">
                      <textarea
                        value={content.seoDescAr}
                        onChange={(e) => setContent({ ...content, seoDescAr: e.target.value })}
                        rows={2}
                        dir="rtl"
                        className="w-full rounded-lg bg-background border border-border p-2 text-sm focus:border-accent outline-none"
                      />
                    </Field>
                  </div>
                </div>
                <div className="mt-4 flex justify-between">
                  <SecondaryButton onClick={() => setStep(1)}>← Retour</SecondaryButton>
                  <PrimaryButton onClick={() => setStep(3)}>Continuer →</PrimaryButton>
                </div>
              </Card>
            )}

            {step === 3 && (
              <Card title="4. Image de couverture (864×1536)">
                <p className="text-xs text-foreground-subtle mb-3">
                  Optionnel. Tu peux ajouter une note créative spécifique avant de générer.
                </p>
                <input
                  value={coverPrompt}
                  onChange={(e) => setCoverPrompt(e.target.value)}
                  placeholder="Ex : palette pastel, plage au coucher du soleil, palmiers"
                  className="w-full rounded-lg bg-background border border-border p-2 text-sm focus:border-accent outline-none mb-3"
                />
                <div className="flex items-start gap-3">
                  <div className="w-48 aspect-[9/16] rounded-lg bg-background border border-border flex items-center justify-center overflow-hidden flex-shrink-0">
                    {coverBase64 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`data:image/jpeg;base64,${coverBase64}`}
                        alt="couverture"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-foreground-subtle" />
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <button
                      onClick={fetchCover}
                      disabled={loadingCover}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-accent/40 hover:bg-accent/10 transition-colors text-sm disabled:opacity-50"
                    >
                      {loadingCover ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Génération… (~30s)
                        </>
                      ) : coverBase64 ? (
                        <>
                          <RefreshCw className="w-4 h-4" />
                          Regénérer
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          Générer la couverture
                        </>
                      )}
                    </button>
                    {coverBase64 && (
                      <button
                        onClick={() => setCoverBase64(null)}
                        className="text-xs text-foreground-subtle hover:text-foreground transition-colors"
                      >
                        Retirer (créer sans couverture)
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex justify-between">
                  <SecondaryButton onClick={() => setStep(2)}>← Retour</SecondaryButton>
                  <PrimaryButton onClick={() => setStep(4)}>Continuer →</PrimaryButton>
                </div>
              </Card>
            )}

            {step === 4 && (
              <Card
                title={`5. Produits à inclure (${selectedProducts.length} sélectionnés)`}
              >
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-subtle" />
                  <input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Recherche par SKU ou nom (ex: A140, daraa, bisht)"
                    className="w-full rounded-lg bg-background border border-border pl-9 pr-3 py-2 text-sm focus:border-accent outline-none"
                  />
                </div>
                {selectedProducts.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3 p-2 rounded-lg bg-accent/5 border border-accent/20">
                    {selectedProducts.map((p) => (
                      <span
                        key={p.id}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-accent/15 text-xs text-accent"
                      >
                        {p.title}
                        <button onClick={() => toggleProduct(p)}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="max-h-[400px] overflow-auto rounded-lg border border-border">
                  {loadingProducts ? (
                    <div className="p-8 text-center text-sm text-foreground-subtle">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                    </div>
                  ) : productResults.length === 0 ? (
                    <div className="p-6 text-center text-sm text-foreground-subtle">
                      {productSearch ? "Aucun résultat" : "Tape pour rechercher"}
                    </div>
                  ) : (
                    productResults.map((p) => {
                      const sel = selectedProducts.some((x) => x.id === p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={() => toggleProduct(p)}
                          className={`w-full flex items-center gap-3 p-2 text-left border-b border-border last:border-b-0 transition-colors ${
                            sel ? "bg-accent/10" : "hover:bg-surface"
                          }`}
                        >
                          {p.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.imageUrl}
                              alt=""
                              className="w-10 h-14 object-cover rounded border border-border flex-shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-14 rounded bg-background border border-border flex-shrink-0" />
                          )}
                          <span className="text-sm flex-1">{p.title}</span>
                          {sel && <Check className="w-4 h-4 text-accent" />}
                        </button>
                      );
                    })
                  )}
                </div>
                <div className="mt-4 flex justify-between">
                  <SecondaryButton onClick={() => setStep(3)}>← Retour</SecondaryButton>
                  <PrimaryButton onClick={() => setStep(5)}>Continuer →</PrimaryButton>
                </div>
              </Card>
            )}

            {step === 5 && content && (
              <Card title="6. Confirmation et création">
                <div className="space-y-3 text-sm">
                  <Row label="Nom EN">{enName}</Row>
                  <Row label="Nom AR" rtl>
                    {arName}
                  </Row>
                  <Row label="Produits">{selectedProducts.length} sélectionnés</Row>
                  <Row label="Image de couverture">
                    {coverBase64 ? "Générée ✓" : "Aucune"}
                  </Row>
                </div>
                <div className="mt-4 space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addToHomepage}
                      onChange={(e) => setAddToHomepage(e.target.checked)}
                    />
                    Ajouter à la page d&apos;accueil
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addToNavMenu}
                      onChange={(e) => setAddToNavMenu(e.target.checked)}
                    />
                    Ajouter au menu de navigation (avec traduction AR)
                  </label>
                </div>
                <div className="mt-6 flex justify-between">
                  <SecondaryButton onClick={() => setStep(4)}>← Retour</SecondaryButton>
                  <PrimaryButton disabled={creating} onClick={submitCreate}>
                    {creating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Création… (~20-30s)
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Créer la collection
                      </>
                    )}
                  </PrimaryButton>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface border border-border p-6">
      <h2 className="text-sm font-semibold text-foreground mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-foreground-subtle mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function Row({
  label,
  children,
  rtl,
}: {
  label: string;
  children: React.ReactNode;
  rtl?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3 border-b border-border pb-2 last:border-b-0">
      <span className="w-32 text-xs text-foreground-subtle">{label}</span>
      <span className="flex-1" dir={rtl ? "rtl" : undefined}>
        {children}
      </span>
    </div>
  );
}

function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-foreground-muted text-sm hover:bg-surface transition-colors"
    >
      {children}
    </button>
  );
}

function ResultPanel({ result }: { result: CreateResult }) {
  return (
    <div className="rounded-xl bg-surface border border-border p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-green-500/15 flex items-center justify-center">
          <Check className="w-5 h-5 text-green-500" />
        </div>
        <div>
          <h2 className="text-base font-semibold">Collection créée</h2>
          <p className="text-xs text-foreground-subtle">handle : {result.handle}</p>
        </div>
      </div>
      <div className="space-y-1 mb-4">
        {result.steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            {s.ok ? (
              <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            )}
            <span className={s.ok ? "" : "text-amber-500"}>{s.name}</span>
            {s.detail && (
              <span className="text-xs text-foreground-subtle truncate">— {s.detail}</span>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href={result.adminUrl}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-accent/15 text-accent border border-accent/30"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Voir dans Shopify Admin
        </a>
        <a
          href={result.storefrontUrl}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-accent/15 text-accent border border-accent/30"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Voir sur le site
        </a>
        <a
          href="/collection-creator"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-surface transition-colors"
        >
          + Créer une autre
        </a>
      </div>
      <div className="mt-4 text-xs text-foreground-subtle">
        Astuce : rafraîchis ta boutique avec Cmd+Shift+R pour voir la nouvelle collection
        sur le storefront (Shopify met le cache du menu en cache).
      </div>
    </div>
  );
}
