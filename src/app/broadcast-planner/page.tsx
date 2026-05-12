"use client";

import { useEffect, useState } from "react";
import {
  Megaphone,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  Wand2,
  History,
  ChevronDown,
  ChevronUp,
  Users,
  Sparkles,
  Search,
  X,
  Package,
  Clock,
  Tag,
  Workflow,
  ImageIcon,
  ListChecks,
  TrendingUp,
} from "lucide-react";

type CampaignType =
  | "new_collection"
  | "promo_flash"
  | "restock"
  | "seasonal_occasion"
  | "vip_exclusive"
  | "recovery";

type SegmentTypeId =
  | "vip"
  | "inactive_60"
  | "inactive_90"
  | "by_country"
  | "by_product_tag"
  | "all_buyers";

type GccCountry = "KW" | "SA" | "AE" | "QA" | "BH" | "OM";

type Tone = "luxe_sobre" | "urgence" | "chaleureux" | "exclusif";

type ShopifyProductLite = {
  id: string;
  title: string;
  handle: string;
  imageUrl: string | null;
  options: Array<{ name: string; values: string[] }>;
};

type SegmentPreview = {
  count: number;
  avgSpentKwd: number;
  totalSpentKwd: number;
  topCountries: Array<{ code: string; count: number }>;
  daysSinceLastOrderMedian: number | null;
  shopifyQuery: string;
  countryLabelAr?: string;
  countryLabelFr?: string;
  sampleEmails: string[];
};

type BroadcastPlan = {
  strategy: {
    summary: string;
    whyNow: string;
    audienceFit: string;
    expectedConversionPct: number;
    estimatedRevenueKwd: number;
    bestSendTime: {
      dayLabel: string;
      hour24: number;
      timezoneLabel: string;
      reasoning: string;
    };
    successMetrics: string[];
  };
  segment: {
    label: string;
    shopifyQuery: string;
    shopifyFlowSuggestion: {
      triggerLabel: string;
      conditions: string[];
      action: string;
      tagToApply: string;
      humanSteps: string[];
    };
  };
  variants: Array<{
    variant: "A" | "B";
    angle: string;
    angleReasoning: string;
    superlemonTemplate: {
      templateName: string;
      category: string;
      type: string;
      languageFr: string;
      languageAr: string;
      headerFr: string;
      headerAr: string;
      bodyFr: string;
      bodyAr: string;
      footerFr: string;
      footerAr: string;
      variables: Array<{ index: number; label: string; exampleValue: string }>;
      buttonLabel: string;
      buttonUrl: string;
    };
    imagePrompt: {
      fr: string;
      ar: string;
      format: string;
      moodKeywords: string[];
    };
  }>;
  copyPasteChecklist: string[];
};

type HistoryItem = {
  id: string;
  created_at: string;
  campaign_type: string;
  segment_type: string;
  occasion: string | null;
  promo_code: string | null;
  plan: BroadcastPlan;
};

const campaignTypeOptions: Array<{ value: CampaignType; label: string; desc: string }> = [
  { value: "new_collection", label: "Nouvelle collection", desc: "Annonce de lancement" },
  { value: "promo_flash", label: "Promo flash", desc: "Code promo + deadline" },
  { value: "restock", label: "Restock", desc: "Alerte retour en stock" },
  { value: "seasonal_occasion", label: "Occasion saisonnière", desc: "Eid, mariage, henna…" },
  { value: "vip_exclusive", label: "Exclu VIP", desc: "Accès anticipé" },
  { value: "recovery", label: "Réactivation", desc: "Réveiller les inactives" },
];

const segmentTypeOptions: Array<{ value: SegmentTypeId; label: string; desc: string }> = [
  { value: "vip", label: "VIP", desc: "≥ 2 commandes" },
  { value: "inactive_60", label: "Inactives 60j+", desc: "Pas commandé depuis 60 jours" },
  { value: "inactive_90", label: "Inactives 90j+", desc: "Pas commandé depuis 90 jours" },
  { value: "by_country", label: "Par pays GCC", desc: "Cibler un pays précis" },
  { value: "by_product_tag", label: "Par tag produit", desc: "A déjà acheté un type" },
  { value: "all_buyers", label: "Tous les clients", desc: "Acheteuses passées (≥ 1 commande)" },
];

const countryOptions: Array<{ value: GccCountry; label: string }> = [
  { value: "KW", label: "Koweït" },
  { value: "SA", label: "Arabie Saoudite" },
  { value: "AE", label: "Émirats" },
  { value: "QA", label: "Qatar" },
  { value: "BH", label: "Bahreïn" },
  { value: "OM", label: "Oman" },
];

const toneOptions: Array<{ value: Tone; label: string }> = [
  { value: "luxe_sobre", label: "Luxe sobre / sensoriel" },
  { value: "urgence", label: "Urgence / direct" },
  { value: "chaleureux", label: "Chaleureux / personnel" },
  { value: "exclusif", label: "Exclusif / VIP confidentiel" },
];

function CopyButton({ text, label = "Copier" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-surface-muted hover:bg-surface text-foreground-muted hover:text-foreground border border-border transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copié" : label}
    </button>
  );
}

export default function BroadcastPlannerPage() {
  const [campaignType, setCampaignType] = useState<CampaignType>("new_collection");
  const [segmentTypeId, setSegmentTypeId] = useState<SegmentTypeId>("vip");
  const [country, setCountry] = useState<GccCountry>("KW");
  const [productTag, setProductTag] = useState("");
  const [tone, setTone] = useState<Tone>("luxe_sobre");
  const [occasion, setOccasion] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [promoDiscountPct, setPromoDiscountPct] = useState("");
  const [promoDeadline, setPromoDeadline] = useState("");
  const [customNotes, setCustomNotes] = useState("");

  const [selectedProduct, setSelectedProduct] = useState<ShopifyProductLite | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<ShopifyProductLite[]>([]);
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [productSearchLoading, setProductSearchLoading] = useState(false);

  const [segmentPreview, setSegmentPreview] = useState<SegmentPreview | null>(null);
  const [segmentLoading, setSegmentLoading] = useState(false);
  const [segmentError, setSegmentError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<BroadcastPlan | null>(null);
  const [streamedText, setStreamedText] = useState("");

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    fetch("/api/broadcast-planner/history?limit=10")
      .then((r) => r.json())
      .then((d) => setHistory(d.items ?? []))
      .catch(() => setHistory([]));
  }, []);

  useEffect(() => {
    if (selectedProduct) return;
    const handle = setTimeout(() => {
      const q = productSearch.trim();
      setProductSearchLoading(true);
      fetch(`/api/shopify/products?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => setProductResults(d.products ?? []))
        .catch(() => setProductResults([]))
        .finally(() => setProductSearchLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [productSearch, selectedProduct]);

  // Reset segment preview when filter changes
  useEffect(() => {
    setSegmentPreview(null);
    setSegmentError(null);
  }, [segmentTypeId, country, productTag]);

  async function handleSegmentPreview() {
    setSegmentError(null);
    setSegmentLoading(true);
    try {
      const body: Record<string, unknown> = { type: segmentTypeId };
      if (segmentTypeId === "by_country") body.country = country;
      if (segmentTypeId === "by_product_tag") body.productTag = productTag.trim();
      const res = await fetch("/api/broadcast-planner/segment-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur Shopify");
      setSegmentPreview(data.preview);
    } catch (e) {
      setSegmentError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSegmentLoading(false);
    }
  }

  function segmentDescription(): string {
    const t = segmentTypeOptions.find((s) => s.value === segmentTypeId)?.label ?? segmentTypeId;
    if (segmentTypeId === "by_country") {
      const c = countryOptions.find((x) => x.value === country)?.label ?? country;
      return `${t} — ${c}`;
    }
    if (segmentTypeId === "by_product_tag") return `${t} — tag "${productTag}"`;
    return t;
  }

  async function handleGenerate() {
    setError(null);
    if (segmentTypeId === "by_product_tag" && !productTag.trim()) {
      setError("Indique un tag produit pour ce segment");
      return;
    }

    setLoading(true);
    setPlan(null);
    setStreamedText("");
    try {
      const res = await fetch("/api/broadcast-planner/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignType,
          segmentTypeId,
          segmentDescription: segmentDescription(),
          segmentPreview,
          tone,
          occasion: occasion.trim() || undefined,
          promoCode: promoCode.trim() || undefined,
          promoDiscountPct: promoDiscountPct ? Number(promoDiscountPct) : undefined,
          promoDeadline: promoDeadline || undefined,
          customNotes: customNotes.trim() || undefined,
          selectedProduct: selectedProduct
            ? {
                id: selectedProduct.id,
                title: selectedProduct.title,
                handle: selectedProduct.handle,
                imageUrl: selectedProduct.imageUrl,
              }
            : undefined,
        }),
      });

      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({ error: "Erreur de génération" }));
        throw new Error(json.error ?? "Erreur de génération");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const evt of events) {
          if (!evt.startsWith("data: ")) continue;
          const payload = evt.slice(6).trim();
          if (!payload) continue;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.type === "delta") {
              accumulated += parsed.text;
              setStreamedText(accumulated);
            } else if (parsed.type === "done") {
              setPlan(parsed.plan);
              setStreamedText("");
            } else if (parsed.type === "error") {
              throw new Error(parsed.error);
            }
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue;
            throw parseErr;
          }
        }
      }

      fetch("/api/broadcast-planner/history?limit=10")
        .then((r) => r.json())
        .then((d) => setHistory(d.items ?? []))
        .catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
      setStreamedText("");
    }
  }

  return (
    <div className="min-h-screen bg-background pt-16 md:pt-0">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-accent-soft">
                <Megaphone className="w-5 h-5 text-accent" strokeWidth={1.75} />
              </div>
              <h1 className="font-display text-2xl font-semibold text-foreground">
                Broadcast Planner
              </h1>
            </div>
            <p className="text-sm text-foreground-muted max-w-2xl">
              Génère des broadcasts WhatsApp luxe pour Blue Marine — segment Shopify en direct,
              message FR/AR, prompt visuel et workflow Shopify Flow. Tu copies dans SuperLemon.
            </p>
          </div>
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-border text-foreground-muted hover:text-foreground hover:bg-surface-muted transition-colors"
          >
            <History className="w-4 h-4" />
            Historique
            {historyOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {historyOpen && (
          <div className="mb-6 rounded-xl border border-border bg-surface p-4">
            {history.length === 0 ? (
              <p className="text-sm text-foreground-muted">Aucun broadcast généré pour le moment.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {h.plan?.segment?.label ?? h.segment_type} · {h.campaign_type}
                      </p>
                      <p className="text-xs text-foreground-muted">
                        {new Date(h.created_at).toLocaleString("fr-FR")}
                        {h.promo_code ? ` · code ${h.promo_code}` : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => setPlan(h.plan)}
                      className="text-xs text-accent hover:underline"
                    >
                      Rouvrir
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="grid lg:grid-cols-[1fr_auto] gap-6">
          {/* FORM */}
          <div className="space-y-6">
            <section className="rounded-xl border border-border bg-surface p-5">
              <h2 className="font-display text-lg font-semibold text-foreground mb-4">
                1. Type de campagne
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {campaignTypeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCampaignType(opt.value)}
                    className={`text-left p-3 rounded-lg border transition-colors ${
                      campaignType === opt.value
                        ? "border-accent bg-accent-soft"
                        : "border-border hover:border-foreground-subtle"
                    }`}
                  >
                    <div className="font-medium text-sm text-foreground">{opt.label}</div>
                    <div className="text-xs text-foreground-muted mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-border bg-surface p-5">
              <h2 className="font-display text-lg font-semibold text-foreground mb-4">
                2. Segment client
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
                {segmentTypeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSegmentTypeId(opt.value)}
                    className={`text-left p-3 rounded-lg border transition-colors ${
                      segmentTypeId === opt.value
                        ? "border-accent bg-accent-soft"
                        : "border-border hover:border-foreground-subtle"
                    }`}
                  >
                    <div className="font-medium text-sm text-foreground">{opt.label}</div>
                    <div className="text-xs text-foreground-muted mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>

              {segmentTypeId === "by_country" && (
                <div className="mb-4">
                  <label className="block text-xs font-medium text-foreground-muted mb-1">
                    Pays
                  </label>
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value as GccCountry)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  >
                    {countryOptions.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {segmentTypeId === "by_product_tag" && (
                <div className="mb-4">
                  <label className="block text-xs font-medium text-foreground-muted mb-1">
                    Tag client Shopify (ex: bisht-buyer, velvet)
                  </label>
                  <input
                    value={productTag}
                    onChange={(e) => setProductTag(e.target.value)}
                    placeholder="bisht-buyer"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={handleSegmentPreview}
                disabled={segmentLoading}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-accent text-accent hover:bg-accent-soft disabled:opacity-50 transition-colors"
              >
                {segmentLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Users className="w-4 h-4" />
                )}
                Aperçu du segment (Shopify live)
              </button>

              {segmentError && (
                <div className="mt-3 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{segmentError}</span>
                </div>
              )}

              {segmentPreview && (
                <div className="mt-4 rounded-lg bg-surface-muted p-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-foreground-muted">Clientes correspondantes</span>
                    <span className="font-display text-2xl font-semibold text-foreground tabular-nums">
                      {segmentPreview.count}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
                    <div>
                      <div className="text-xs text-foreground-muted">Dépense moyenne</div>
                      <div className="font-medium tabular-nums">
                        {segmentPreview.avgSpentKwd.toLocaleString("fr-FR")} KD
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-foreground-muted">Total historique</div>
                      <div className="font-medium tabular-nums">
                        {segmentPreview.totalSpentKwd.toLocaleString("fr-FR")} KD
                      </div>
                    </div>
                    {segmentPreview.daysSinceLastOrderMedian !== null && (
                      <div>
                        <div className="text-xs text-foreground-muted">
                          Médiane jours / dernière commande
                        </div>
                        <div className="font-medium tabular-nums">
                          {segmentPreview.daysSinceLastOrderMedian}
                        </div>
                      </div>
                    )}
                    {segmentPreview.topCountries.length > 0 && (
                      <div>
                        <div className="text-xs text-foreground-muted">Top pays</div>
                        <div className="font-medium text-xs">
                          {segmentPreview.topCountries
                            .map((c) => `${c.code} (${c.count})`)
                            .join(" · ")}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="pt-2 border-t border-border flex items-center justify-between gap-2">
                    <code className="text-xs text-foreground-muted truncate">
                      {segmentPreview.shopifyQuery}
                    </code>
                    <CopyButton text={segmentPreview.shopifyQuery} label="Query" />
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-border bg-surface p-5">
              <h2 className="font-display text-lg font-semibold text-foreground mb-4">
                3. Détails de l'offre
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-foreground-muted mb-1">
                    Occasion / contexte
                  </label>
                  <input
                    value={occasion}
                    onChange={(e) => setOccasion(e.target.value)}
                    placeholder="ex: Eid al-Adha, mariage saison été, fin de stock velours…"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-muted mb-1">
                    Code promo (optionnel)
                  </label>
                  <input
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    placeholder="VIP25"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-muted mb-1">
                    Remise % (optionnel)
                  </label>
                  <input
                    type="number"
                    value={promoDiscountPct}
                    onChange={(e) => setPromoDiscountPct(e.target.value)}
                    placeholder="25"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-muted mb-1">
                    Deadline (optionnel)
                  </label>
                  <input
                    type="date"
                    value={promoDeadline}
                    onChange={(e) => setPromoDeadline(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-muted mb-1">
                    Ton
                  </label>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value as Tone)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  >
                    {toneOptions.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Product autocomplete */}
                <div className="sm:col-span-2 relative">
                  <label className="block text-xs font-medium text-foreground-muted mb-1">
                    Produit mis en avant (optionnel)
                  </label>
                  {selectedProduct ? (
                    <div className="flex items-center gap-3 p-2 rounded-lg border border-border bg-surface-muted">
                      {selectedProduct.imageUrl && (
                        <img
                          src={selectedProduct.imageUrl}
                          alt={selectedProduct.title}
                          className="w-10 h-14 object-cover rounded"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{selectedProduct.title}</p>
                        <p className="text-xs text-foreground-muted truncate">
                          /{selectedProduct.handle}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedProduct(null)}
                        className="p-1 rounded hover:bg-surface"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-subtle" />
                        <input
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                          onFocus={() => setProductSearchOpen(true)}
                          onBlur={() => setTimeout(() => setProductSearchOpen(false), 150)}
                          placeholder="Rechercher un produit Shopify…"
                          className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm"
                        />
                      </div>
                      {productSearchOpen && (
                        <div className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
                          {productSearchLoading && (
                            <div className="p-3 text-sm text-foreground-muted flex items-center gap-2">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Recherche…
                            </div>
                          )}
                          {!productSearchLoading && productResults.length === 0 && (
                            <div className="p-3 text-sm text-foreground-muted">
                              Aucun produit trouvé
                            </div>
                          )}
                          {!productSearchLoading &&
                            productResults.map((p) => (
                              <button
                                type="button"
                                key={p.id}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setSelectedProduct(p);
                                  setProductSearch("");
                                  setProductSearchOpen(false);
                                }}
                                className="w-full text-left p-2 hover:bg-surface-muted flex items-center gap-2"
                              >
                                {p.imageUrl && (
                                  <img
                                    src={p.imageUrl}
                                    alt=""
                                    className="w-8 h-11 object-cover rounded"
                                  />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm truncate">{p.title}</p>
                                  <p className="text-xs text-foreground-muted truncate">
                                    /{p.handle}
                                  </p>
                                </div>
                              </button>
                            ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-foreground-muted mb-1">
                    Notes / contexte additionnel (optionnel)
                  </label>
                  <textarea
                    value={customNotes}
                    onChange={(e) => setCustomNotes(e.target.value)}
                    placeholder="Ex: Tu peux mentionner que c'est notre dernière collection avant l'été…"
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none"
                  />
                </div>
              </div>
            </section>

            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-accent text-white font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Wand2 className="w-5 h-5" />
              )}
              {loading ? "Génération en cours…" : "Générer le broadcast"}
            </button>

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Streaming output */}
            {streamedText && !plan && (
              <section className="rounded-xl border border-border bg-surface-muted p-4">
                <div className="flex items-center gap-2 mb-2 text-xs text-foreground-muted">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Claude génère le plan…
                </div>
                <pre className="text-xs text-foreground-muted whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">
                  {streamedText.slice(-1500)}
                </pre>
              </section>
            )}

            {/* PLAN OUTPUT */}
            {plan && <PlanView plan={plan} />}
          </div>

          {/* Side info */}
          <aside className="hidden lg:block w-72 shrink-0 sticky top-8 self-start space-y-4">
            <div className="rounded-xl border border-border bg-surface p-4">
              <h3 className="font-display text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" />
                Comment ça marche
              </h3>
              <ol className="text-xs text-foreground-muted space-y-2 list-decimal list-inside">
                <li>Choisis le type de campagne</li>
                <li>Choisis le segment client → clique "Aperçu" pour voir les vrais chiffres</li>
                <li>Renseigne occasion, code promo, ton</li>
                <li>Génère → tu reçois 2 variantes A/B + prompt visuel + Shopify Flow</li>
                <li>Copie dans SuperLemon, Shopify Flow, Canva</li>
              </ol>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4 text-xs text-foreground-muted space-y-2">
              <p className="font-medium text-foreground">⚡ Tip pro</p>
              <p>
                Lance toujours <strong>l'aperçu segment</strong> avant de générer — Claude
                calibre le message et le CA estimé sur les vrais chiffres de ton Shopify.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function PlanView({ plan }: { plan: BroadcastPlan }) {
  return (
    <div className="space-y-6">
      {/* Strategy */}
      <section className="rounded-xl border border-accent/30 bg-accent-soft/40 p-5">
        <h2 className="font-display text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-accent" />
          Stratégie
        </h2>
        <p className="text-sm text-foreground mb-3">{plan.strategy.summary}</p>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-foreground-muted">Pourquoi maintenant</div>
            <div className="mt-1">{plan.strategy.whyNow}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-foreground-muted">Fit segment</div>
            <div className="mt-1">{plan.strategy.audienceFit}</div>
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-accent/20">
          <div>
            <div className="text-xs text-foreground-muted">Conversion estimée</div>
            <div className="font-display text-2xl font-semibold text-foreground tabular-nums">
              {plan.strategy.expectedConversionPct}%
            </div>
          </div>
          <div>
            <div className="text-xs text-foreground-muted">CA potentiel</div>
            <div className="font-display text-2xl font-semibold text-foreground tabular-nums">
              {plan.strategy.estimatedRevenueKwd.toLocaleString("fr-FR")} KD
            </div>
          </div>
          <div>
            <div className="text-xs text-foreground-muted flex items-center gap-1">
              <Clock className="w-3 h-3" /> Envoi optimal
            </div>
            <div className="font-medium mt-1">
              {plan.strategy.bestSendTime.dayLabel} {plan.strategy.bestSendTime.hour24}h
            </div>
            <div className="text-xs text-foreground-muted">{plan.strategy.bestSendTime.timezoneLabel}</div>
          </div>
        </div>
        <p className="text-xs text-foreground-muted mt-2 italic">
          {plan.strategy.bestSendTime.reasoning}
        </p>
        {plan.strategy.successMetrics?.length > 0 && (
          <div className="mt-3 pt-3 border-t border-accent/20">
            <div className="text-xs uppercase tracking-wide text-foreground-muted mb-1">KPI cibles</div>
            <ul className="text-sm space-y-0.5">
              {plan.strategy.successMetrics.map((m, i) => (
                <li key={i}>• {m}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Variants A & B */}
      {plan.variants.map((v) => (
        <VariantCard key={v.variant} variant={v} />
      ))}

      {/* Segment + Shopify Flow */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-display text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
          <Workflow className="w-5 h-5 text-accent" />
          Segment & Shopify Flow
        </h2>
        <div className="mb-4">
          <div className="text-xs uppercase tracking-wide text-foreground-muted mb-1">Segment</div>
          <div className="font-medium">{plan.segment.label}</div>
          <div className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-surface-muted">
            <code className="text-xs flex-1 truncate">{plan.segment.shopifyQuery}</code>
            <CopyButton text={plan.segment.shopifyQuery} label="Query" />
          </div>
        </div>
        <div className="pt-4 border-t border-border">
          <div className="text-xs uppercase tracking-wide text-foreground-muted mb-2">
            Workflow Shopify Flow suggéré
          </div>
          <div className="grid sm:grid-cols-2 gap-3 text-sm mb-3">
            <div>
              <div className="text-xs text-foreground-muted">Trigger</div>
              <div>{plan.segment.shopifyFlowSuggestion.triggerLabel}</div>
            </div>
            <div>
              <div className="text-xs text-foreground-muted">Action</div>
              <div>{plan.segment.shopifyFlowSuggestion.action}</div>
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs text-foreground-muted">Conditions</div>
              <ul className="text-sm space-y-0.5 mt-1">
                {plan.segment.shopifyFlowSuggestion.conditions.map((c, i) => (
                  <li key={i}>• {c}</li>
                ))}
              </ul>
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs text-foreground-muted">Tag à appliquer</div>
              <div className="inline-flex items-center gap-1.5 mt-1">
                <Tag className="w-3.5 h-3.5" />
                <code className="text-sm bg-surface-muted px-2 py-0.5 rounded">
                  {plan.segment.shopifyFlowSuggestion.tagToApply}
                </code>
                <CopyButton text={plan.segment.shopifyFlowSuggestion.tagToApply} label="Tag" />
              </div>
            </div>
          </div>
          <div className="rounded-lg bg-surface-muted p-3">
            <div className="text-xs font-medium text-foreground-muted mb-2">
              Étapes pour créer le workflow dans Shopify Flow
            </div>
            <ol className="text-sm space-y-1.5 list-decimal list-inside">
              {plan.segment.shopifyFlowSuggestion.humanSteps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Checklist */}
      {plan.copyPasteChecklist?.length > 0 && (
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="font-display text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-accent" />
            Checklist SuperLemon
          </h2>
          <ol className="text-sm space-y-1.5 list-decimal list-inside">
            {plan.copyPasteChecklist.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function VariantCard({ variant: v }: { variant: BroadcastPlan["variants"][number] }) {
  const t = v.superlemonTemplate;
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-foreground-muted">
            Variante {v.variant}
          </div>
          <h2 className="font-display text-lg font-semibold text-foreground">{v.angle}</h2>
        </div>
      </div>
      <p className="text-sm text-foreground-muted italic mb-4">{v.angleReasoning}</p>

      <div className="space-y-4">
        {/* SuperLemon template fields */}
        <div className="rounded-lg bg-surface-muted p-4 space-y-3">
          <div className="text-xs font-medium text-foreground-muted uppercase tracking-wide">
            Template SuperLemon — copie champ par champ
          </div>

          <Field label="Template Name" value={t.templateName} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" value={t.category} />
            <Field label="Type" value={t.type} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Language FR" value={t.languageFr} />
            <Field label="Language AR" value={t.languageAr} />
          </div>

          <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-border">
            <div>
              <div className="text-xs text-foreground-muted mb-1">Header FR</div>
              <div className="flex items-start gap-2">
                <p className="text-sm flex-1">{t.headerFr}</p>
                <CopyButton text={t.headerFr} />
              </div>
            </div>
            <div dir="rtl">
              <div className="text-xs text-foreground-muted mb-1">Header AR</div>
              <div className="flex items-start gap-2">
                <p className="text-sm flex-1 font-display">{t.headerAr}</p>
                <CopyButton text={t.headerAr} />
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-border">
            <div>
              <div className="text-xs text-foreground-muted mb-1">Body FR</div>
              <div className="flex items-start gap-2">
                <p className="text-sm flex-1 whitespace-pre-wrap">{t.bodyFr}</p>
                <CopyButton text={t.bodyFr} />
              </div>
            </div>
            <div dir="rtl">
              <div className="text-xs text-foreground-muted mb-1">Body AR</div>
              <div className="flex items-start gap-2">
                <p className="text-sm flex-1 whitespace-pre-wrap font-display">{t.bodyAr}</p>
                <CopyButton text={t.bodyAr} />
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-border">
            <div>
              <div className="text-xs text-foreground-muted mb-1">Footer FR</div>
              <p className="text-sm">{t.footerFr}</p>
            </div>
            <div dir="rtl">
              <div className="text-xs text-foreground-muted mb-1">Footer AR</div>
              <p className="text-sm font-display">{t.footerAr}</p>
            </div>
          </div>

          {t.variables?.length > 0 && (
            <div className="pt-2 border-t border-border">
              <div className="text-xs text-foreground-muted mb-2">Variables dynamiques</div>
              <ul className="text-sm space-y-1">
                {t.variables.map((v, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <code className="bg-background px-1.5 py-0.5 rounded text-xs">
                      {"{{" + v.index + "}}"}
                    </code>
                    <span className="text-foreground-muted">{v.label}</span>
                    <span className="text-foreground">→</span>
                    <span className="italic">{v.exampleValue}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-2 border-t border-border">
            <div className="text-xs text-foreground-muted mb-1">Button</div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{t.buttonLabel}</span>
              <span className="text-xs text-foreground-muted">→</span>
              <code className="text-xs bg-background px-2 py-1 rounded truncate flex-1 min-w-0">
                {t.buttonUrl}
              </code>
              <CopyButton text={t.buttonUrl} label="URL" />
            </div>
          </div>

          <div className="pt-2 border-t border-border">
            <CopyButton
              text={buildFullTemplateText(t)}
              label="Tout copier (FR + AR formaté)"
            />
          </div>
        </div>

        {/* Image prompt */}
        <div className="rounded-lg border border-accent/30 bg-accent-soft/30 p-4">
          <div className="text-xs font-medium text-foreground-muted uppercase tracking-wide mb-2 flex items-center gap-2">
            <ImageIcon className="w-3.5 h-3.5" />
            Prompt visuel — à utiliser dans Canva / Midjourney / Gemini
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-foreground-muted mb-1">Brief FR</div>
              <div className="flex items-start gap-2">
                <p className="text-sm flex-1">{v.imagePrompt.fr}</p>
                <CopyButton text={v.imagePrompt.fr} />
              </div>
            </div>
            <div dir="rtl">
              <div className="text-xs text-foreground-muted mb-1">Brief AR</div>
              <div className="flex items-start gap-2">
                <p className="text-sm flex-1 font-display">{v.imagePrompt.ar}</p>
                <CopyButton text={v.imagePrompt.ar} />
              </div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-accent/20 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-foreground-muted">Format :</span>
            <code className="bg-background px-2 py-0.5 rounded">{v.imagePrompt.format}</code>
            <span className="text-foreground-muted ml-2">Mood :</span>
            {v.imagePrompt.moodKeywords.map((k, i) => (
              <span key={i} className="bg-background px-2 py-0.5 rounded">
                {k}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-foreground-muted mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <code className="text-sm bg-background px-2 py-1 rounded flex-1 truncate">{value}</code>
        <CopyButton text={value} />
      </div>
    </div>
  );
}

function buildFullTemplateText(t: BroadcastPlan["variants"][number]["superlemonTemplate"]): string {
  return [
    `Template Name: ${t.templateName}`,
    `Category: ${t.category}`,
    `Type: ${t.type}`,
    ``,
    `=== FRANÇAIS ===`,
    `Header: ${t.headerFr}`,
    `Body:`,
    t.bodyFr,
    `Footer: ${t.footerFr}`,
    ``,
    `=== العربية ===`,
    `Header: ${t.headerAr}`,
    `Body:`,
    t.bodyAr,
    `Footer: ${t.footerAr}`,
    ``,
    `=== BUTTON ===`,
    `Label: ${t.buttonLabel}`,
    `URL: ${t.buttonUrl}`,
  ].join("\n");
}
