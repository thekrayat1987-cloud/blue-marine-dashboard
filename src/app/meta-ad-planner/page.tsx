"use client";

import { useEffect, useState } from "react";
import {
  Target,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  Wand2,
  History,
  ChevronDown,
  ChevronUp,
  Megaphone,
  Users,
  MapPin,
  DollarSign,
  Calendar,
  Sparkles,
  TrendingUp,
  ClipboardList,
  Layers,
  Lightbulb,
  Globe,
  ListChecks,
  Search,
  X,
  Package,
  Rocket,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

type CampaignObjective =
  | "OUTCOME_SALES"
  | "OUTCOME_TRAFFIC"
  | "OUTCOME_AWARENESS"
  | "OUTCOME_ENGAGEMENT"
  | "OUTCOME_LEADS";

type AdPlanCountry =
  | ""
  | "Kuwait"
  | "Saudi Arabia"
  | "United Arab Emirates"
  | "Qatar"
  | "Bahrain"
  | "Oman";

type AdPlan = {
  strategy: {
    summary: string;
    recommendedDailyBudgetKwd: number;
    durationDays: number;
    totalBudgetKwd: number;
    reasoning: string;
    keySuccessMetrics: string[];
  };
  campaign: {
    name: string;
    objective: CampaignObjective;
    objectiveLabel: string;
    objectiveReasoning: string;
    buyingType: "AUCTION";
    specialAdCategory: "NONE";
    budgetType: "ad_set_budget" | "campaign_budget";
    budgetTypeReasoning: string;
  };
  adSets: Array<{
    name: string;
    audience: {
      locations: string[];
      ageMin: number;
      ageMax: number;
      genders: Array<"women" | "men" | "all">;
      languages: string[];
      detailedTargeting: {
        interests: string[];
        behaviors: string[];
        demographics: string[];
      };
      exclude: string[];
      audienceReasoning: string;
    };
    placements: string[];
    placementsReasoning: string;
    dailyBudgetKwd: number;
    optimizationGoal: string;
    optimizationReasoning: string;
    schedule: string;
  }>;
  adVariants: Array<{
    variant: "A" | "B" | "C";
    angle: string;
    angleReasoning: string;
    primaryText: { ar: string; fr: string };
    headline: { ar: string; fr: string };
    description: { ar: string; fr: string };
    cta: string;
    ctaLabel: string;
    destinationUrl: string;
    creativeRecommendation: string;
    scrollStopScore: number;
  }>;
  metaPixelEvents: {
    primary: string;
    secondary: string[];
    reasoning: string;
  };
  copyPasteChecklist: string[];
};

type HistoryItem = {
  id: string;
  created_at: string;
  brief: string;
  budget_kwd: number | null;
  duration_days: number | null;
  primary_country: string | null;
  objective_hint: string | null;
  plan: AdPlan;
};

type ShopifyProductLite = {
  id: string;
  title: string;
  handle: string;
  imageUrl: string | null;
  options: Array<{ name: string; values: string[] }>;
};

type PushResult = {
  campaignId: string;
  campaignUrl: string;
  adSetId: string;
  adSetUrl: string;
  ads: Array<{ variant: "A" | "B" | "C"; adId: string; adUrl: string; creativeId: string }>;
  adsManagerUrl: string;
  errors: string[];
  warnings: string[];
};

const objectiveOptions: Array<{ value: CampaignObjective | "AUTO"; label: string }> = [
  { value: "AUTO", label: "Auto (l'IA choisit)" },
  { value: "OUTCOME_SALES", label: "Ventes (conversion)" },
  { value: "OUTCOME_TRAFFIC", label: "Trafic (clics)" },
  { value: "OUTCOME_ENGAGEMENT", label: "Engagement / WhatsApp" },
  { value: "OUTCOME_AWARENESS", label: "Notoriété" },
  { value: "OUTCOME_LEADS", label: "Leads (formulaire)" },
];

const countryOptions: Array<{ value: AdPlanCountry; label: string }> = [
  { value: "", label: "GCC complet (recommandé)" },
  { value: "Kuwait", label: "Koweït uniquement" },
  { value: "Saudi Arabia", label: "Arabie Saoudite" },
  { value: "United Arab Emirates", label: "Émirats" },
  { value: "Qatar", label: "Qatar" },
  { value: "Bahrain", label: "Bahreïn" },
  { value: "Oman", label: "Oman" },
];

const briefPresets = [
  "Pousser la collection Khairan vers les mariées du Golfe",
  "Tester un nouveau bisht noir en velours — drive WhatsApp",
  "Lancer la marque sur l'Arabie Saoudite (Reels Stories)",
  "Re-cibler les visiteurs site qui n'ont pas acheté",
];

export default function MetaAdPlannerPage() {
  const [brief, setBrief] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ShopifyProductLite | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<ShopifyProductLite[]>([]);
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [budgetKwd, setBudgetKwd] = useState<string>("5");
  const [durationDays, setDurationDays] = useState<string>("14");
  const [primaryCountry, setPrimaryCountry] = useState<AdPlanCountry>("");
  const [objectiveHint, setObjectiveHint] = useState<CampaignObjective | "AUTO">("AUTO");
  const [regenerateNote, setRegenerateNote] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<AdPlan | null>(null);
  const [usage, setUsage] = useState<{ input_tokens: number; output_tokens: number } | null>(
    null,
  );
  const [streamedText, setStreamedText] = useState("");

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [pushConfirm, setPushConfirm] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<PushResult | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ad-planner/history?limit=10")
      .then((r) => r.json())
      .then((d) => setHistory(d.items ?? []))
      .catch(() => setHistory([]));
  }, []);

  // Debounced product search
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

  async function handleGenerate() {
    setError(null);
    if (!brief.trim()) {
      setError("Décris ta campagne d'abord");
      return;
    }

    setLoading(true);
    setPlan(null);
    setStreamedText("");
    try {
      const res = await fetch("/api/ad-planner/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: brief.trim(),
          selectedProduct: selectedProduct ?? undefined,
          budgetKwd: budgetKwd ? Number(budgetKwd) : undefined,
          durationDays: durationDays ? Number(durationDays) : undefined,
          primaryCountry: primaryCountry || undefined,
          objectiveHint,
          regenerateNote: regenerateNote.trim() || undefined,
          stream: "true",
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
              setUsage(parsed.usage ?? null);
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

      fetch("/api/ad-planner/history?limit=10")
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

  async function handlePushToMeta() {
    if (!plan) return;
    setPushing(true);
    setPushError(null);
    setPushResult(null);
    try {
      const res = await fetch("/api/ad-planner/push-to-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          selectedProduct: selectedProduct ?? null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Push échoué");
      setPushResult(json);
    } catch (e) {
      setPushError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setPushing(false);
      setPushConfirm(false);
    }
  }

  function loadFromHistory(item: HistoryItem) {
    setBrief(item.brief);
    setBudgetKwd(item.budget_kwd ? String(item.budget_kwd) : "5");
    setDurationDays(item.duration_days ? String(item.duration_days) : "14");
    setPrimaryCountry((item.primary_country as AdPlanCountry) ?? "");
    setObjectiveHint((item.objective_hint as CampaignObjective | "AUTO") ?? "AUTO");
    setPlan(item.plan);
    setPushResult(null);
    setPushError(null);
    setHistoryOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="px-6 md:px-10 py-8 md:py-10 max-w-[1400px] mx-auto">
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center">
            <Target className="w-5 h-5 text-accent" strokeWidth={1.75} />
          </div>
          <h1 className="font-display text-3xl font-semibold text-foreground">
            Meta Ad Planner
          </h1>
        </div>
        <p className="text-sm text-foreground-muted ml-13">
          Plan stratégique complet pour Facebook / Instagram Ads. Tu décris ta campagne, l&apos;IA
          construit campagne + audience + 3 variantes d&apos;annonces (A/B/C) — prêt à copier dans Ads Manager.
        </p>
      </header>

      <div className="grid lg:grid-cols-[420px_1fr] gap-6">
        {/* LEFT — Inputs */}
        <div className="space-y-5">
          {/* Brief */}
          <section className="bg-surface border border-border rounded-2xl p-5">
            <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-accent" strokeWidth={1.75} />
              Brief de campagne <span className="text-danger">*</span>
            </h2>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="ex: Je veux promouvoir la nouvelle collection Khairan. Cibler les mariées du Golfe. Pousser vers WhatsApp pour réserver."
              rows={5}
              className="w-full px-3 py-2 text-sm bg-surface-muted border border-border rounded-lg focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft resize-none"
            />
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {briefPresets.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setBrief(p)}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-border text-foreground-muted hover:border-accent hover:text-accent"
                >
                  {p.length > 40 ? p.slice(0, 40) + "…" : p}
                </button>
              ))}
            </div>
          </section>

          {/* Optional fields */}
          <section className="bg-surface border border-border rounded-2xl p-5 space-y-4">
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-accent" strokeWidth={1.75} />
              Paramètres
            </h2>

            <div>
              <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Package className="w-3 h-3" /> Produit Shopify (optionnel)
              </label>
              {selectedProduct ? (
                <div className="flex items-center gap-3 p-2.5 bg-accent-soft border border-accent/30 rounded-lg">
                  {selectedProduct.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedProduct.imageUrl}
                      alt=""
                      className="w-12 h-12 rounded-md object-cover shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {selectedProduct.title}
                    </p>
                    <p className="text-[11px] text-foreground-muted truncate">
                      /products/{selectedProduct.handle}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedProduct(null);
                      setProductSearch("");
                    }}
                    className="text-foreground-muted hover:text-danger p-1"
                    aria-label="Retirer le produit"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-subtle pointer-events-none" />
                    <input
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      onFocus={() => setProductSearchOpen(true)}
                      onBlur={() =>
                        setTimeout(() => setProductSearchOpen(false), 150)
                      }
                      placeholder="Chercher un produit (ex: Khairan, bisht…)"
                      className="w-full pl-8 pr-3 py-2 text-sm bg-surface-muted border border-border rounded-lg focus:outline-none focus:border-accent"
                    />
                  </div>
                  {productSearchOpen && (
                    <div className="absolute z-20 mt-1 left-0 right-0 max-h-72 overflow-y-auto bg-surface border border-border rounded-lg shadow-lg">
                      {productSearchLoading && (
                        <div className="px-3 py-3 text-xs text-foreground-muted flex items-center gap-2">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Recherche…
                        </div>
                      )}
                      {!productSearchLoading && productResults.length === 0 && (
                        <div className="px-3 py-3 text-xs text-foreground-muted">
                          Aucun produit trouvé.
                        </div>
                      )}
                      {!productSearchLoading &&
                        productResults.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setSelectedProduct(p);
                              setProductSearchOpen(false);
                              setProductSearch("");
                            }}
                            className="w-full flex items-center gap-2.5 px-2.5 py-2 hover:bg-surface-muted text-left border-b border-border last:border-0"
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
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-foreground truncate">
                                {p.title}
                              </p>
                              <p className="text-[10px] text-foreground-subtle truncate">
                                /products/{p.handle}
                              </p>
                            </div>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <DollarSign className="w-3 h-3" /> Budget / jour (KWD)
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  value={budgetKwd}
                  onChange={(e) => setBudgetKwd(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-surface-muted border border-border rounded-lg focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" /> Durée (jours)
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-surface-muted border border-border rounded-lg focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Globe className="w-3 h-3" /> Pays prioritaire
              </label>
              <select
                value={primaryCountry}
                onChange={(e) => setPrimaryCountry(e.target.value as AdPlanCountry)}
                className="w-full px-3 py-2 text-sm bg-surface-muted border border-border rounded-lg focus:outline-none focus:border-accent"
              >
                {countryOptions.map((o) => (
                  <option key={o.value || "all"} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Target className="w-3 h-3" /> Objectif Meta
              </label>
              <select
                value={objectiveHint}
                onChange={(e) =>
                  setObjectiveHint(e.target.value as CampaignObjective | "AUTO")
                }
                className="w-full px-3 py-2 text-sm bg-surface-muted border border-border rounded-lg focus:outline-none focus:border-accent"
              >
                {objectiveOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-1.5">
                Note de régénération (optionnel)
              </label>
              <input
                value={regenerateNote}
                onChange={(e) => setRegenerateNote(e.target.value)}
                placeholder="plus agressif / plus émotionnel / budget plus bas…"
                className="w-full px-3 py-2 text-sm bg-surface-muted border border-border rounded-lg focus:outline-none focus:border-accent"
              />
            </div>
          </section>

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-hover text-white font-medium py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                L&apos;IA construit le plan…
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" strokeWidth={1.75} />
                Générer le plan complet
              </>
            )}
          </button>

          {error && (
            <div className="bg-danger-soft border border-danger/30 rounded-xl p-3 flex items-start gap-2 text-sm text-danger">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* RIGHT — Plan */}
        <div className="space-y-5 max-w-2xl">
          {loading && (
            <div className="bg-surface border border-border rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Loader2 className="w-5 h-5 animate-spin text-accent" />
                <p className="font-display text-base text-foreground">
                  Claude écrit ton plan en direct…
                </p>
                <span className="text-[11px] text-foreground-subtle ml-auto tabular-nums">
                  {streamedText.length.toLocaleString("fr-FR")} caractères
                </span>
              </div>
              {streamedText ? (
                <pre className="text-[11px] font-mono text-foreground-muted bg-surface-muted/60 rounded-lg p-3 max-h-72 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {streamedText.length > 4000
                    ? "…" + streamedText.slice(-4000)
                    : streamedText}
                </pre>
              ) : (
                <p className="text-xs text-foreground-muted">
                  Connexion au modèle, lecture de tes 30 derniers jours Meta…
                </p>
              )}
            </div>
          )}

          {!loading && !plan && (
            <div className="bg-surface border border-border rounded-2xl p-10 text-center">
              <Target className="w-10 h-10 text-accent-soft mx-auto mb-3" strokeWidth={1.5} />
              <p className="font-display text-lg text-foreground">
                Prête à planifier ta prochaine campagne
              </p>
              <p className="text-sm text-foreground-muted mt-1.5 max-w-md mx-auto">
                Décris en quelques phrases ce que tu veux pousser. L&apos;IA te livre un plan
                complet copier-coller pour Ads Manager.
              </p>
            </div>
          )}

          {plan && usage && (
            <div className="bg-accent-soft border border-accent/30 rounded-xl px-4 py-2.5 text-xs text-foreground-muted flex items-center justify-between">
              <span>
                <strong className="text-foreground">Plan généré</strong> — {plan.adVariants.length}{" "}
                variantes
              </span>
              <span>
                {usage.input_tokens} in · {usage.output_tokens} out tokens
              </span>
            </div>
          )}

          {plan && !pushResult && (
            <section className="bg-gradient-to-br from-accent-soft via-surface to-surface border border-accent/40 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shrink-0">
                  <Rocket className="w-5 h-5 text-white" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-lg font-semibold text-foreground">
                    Pousser dans Ads Manager (brouillon)
                  </h2>
                  <p className="text-sm text-foreground-muted mt-1 mb-3 leading-relaxed">
                    Création directe de la campagne + ad set + 3 ads dans ton compte Meta,
                    tous en statut <strong>PAUSÉ</strong>. Rien ne sera publié — tu pourras tout
                    vérifier dans Ads Manager avant d&apos;activer.
                  </p>
                  {!pushConfirm ? (
                    <button
                      onClick={() => setPushConfirm(true)}
                      disabled={pushing}
                      className="bg-accent hover:bg-accent-hover text-white font-medium py-2.5 px-5 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-60"
                    >
                      <Rocket className="w-4 h-4" strokeWidth={1.75} />
                      Pousser dans Meta
                    </button>
                  ) : (
                    <div className="bg-surface border border-border rounded-lg p-3">
                      <p className="text-sm text-foreground mb-3">
                        Confirme la création dans ton compte Meta ?
                        Tout sera en <strong>PAUSED</strong>, aucun budget dépensé tant que tu
                        n&apos;actives pas manuellement.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={handlePushToMeta}
                          disabled={pushing}
                          className="bg-accent hover:bg-accent-hover text-white font-medium py-2 px-4 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-60"
                        >
                          {pushing ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Création…
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} />
                              Oui, créer en brouillon
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => setPushConfirm(false)}
                          disabled={pushing}
                          className="border border-border hover:bg-surface-muted text-foreground-muted font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-60"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}
                  {pushError && (
                    <div className="mt-3 bg-danger-soft border border-danger/30 rounded-lg p-3 flex items-start gap-2 text-sm text-danger">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{pushError}</span>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {pushResult && <PushResultView result={pushResult} />}

          {plan && <PlanView plan={plan} />}

          {/* History */}
          <section className="bg-surface border border-border rounded-2xl">
            <button
              onClick={() => setHistoryOpen((o) => !o)}
              className="w-full flex items-center justify-between px-5 py-4 text-left"
            >
              <span className="font-display text-base font-semibold flex items-center gap-2">
                <History className="w-4 h-4 text-accent" strokeWidth={1.75} />
                Historique ({history.length})
              </span>
              {historyOpen ? (
                <ChevronUp className="w-4 h-4 text-foreground-muted" />
              ) : (
                <ChevronDown className="w-4 h-4 text-foreground-muted" />
              )}
            </button>
            {historyOpen && history.length > 0 && (
              <ul className="border-t border-border divide-y divide-border">
                {history.map((h) => (
                  <li key={h.id}>
                    <button
                      onClick={() => loadFromHistory(h)}
                      className="w-full text-left px-5 py-3 text-sm hover:bg-surface-muted transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-foreground font-medium truncate max-w-[80%]">
                          {h.brief}
                        </span>
                        <span className="text-[11px] text-foreground-subtle ml-3 shrink-0">
                          {new Date(h.created_at).toLocaleDateString("fr-FR", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div className="text-[11px] text-foreground-muted mt-0.5">
                        {h.plan?.campaign?.name ?? "—"} · {h.plan?.campaign?.objectiveLabel ?? ""}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {historyOpen && history.length === 0 && (
              <div className="px-5 py-4 text-sm text-foreground-muted border-t border-border">
                Aucun plan généré pour le moment.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function PushResultView({ result }: { result: PushResult }) {
  return (
    <section className="bg-success-soft border border-success/30 rounded-2xl p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-success flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-5 h-5 text-white" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Campagne créée dans Meta (PAUSÉE)
          </h2>
          <p className="text-sm text-foreground-muted mt-1 mb-4">
            Tout est en brouillon dans ton compte. Ouvre Ads Manager pour vérifier puis activer.
          </p>

          <a
            href={result.adsManagerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-white font-medium py-2.5 px-5 rounded-lg transition-colors mb-4"
          >
            <ExternalLink className="w-4 h-4" strokeWidth={1.75} />
            Ouvrir dans Ads Manager
          </a>

          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between py-2 border-b border-success/20">
              <span className="text-foreground-muted">Campagne</span>
              <a
                href={result.campaignUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-accent hover:underline flex items-center gap-1"
              >
                {result.campaignId}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-success/20">
              <span className="text-foreground-muted">Ad set</span>
              <a
                href={result.adSetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-accent hover:underline flex items-center gap-1"
              >
                {result.adSetId}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            {result.ads.map((a) => (
              <div
                key={a.adId}
                className="flex items-center justify-between py-2 border-b border-success/20 last:border-0"
              >
                <span className="text-foreground-muted">Ad {a.variant}</span>
                <a
                  href={a.adUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-accent hover:underline flex items-center gap-1"
                >
                  {a.adId}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ))}
          </div>

          {result.warnings.length > 0 && (
            <div className="mt-4 bg-warning-soft border border-warning/30 rounded-lg p-3">
              <p className="text-[11px] uppercase tracking-wider text-warning font-medium mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" /> À ajouter manuellement
              </p>
              <ul className="space-y-1 text-xs text-foreground-muted">
                {result.warnings.map((w, i) => (
                  <li key={i} className="leading-relaxed">
                    • {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="mt-3 bg-danger-soft border border-danger/30 rounded-lg p-3">
              <p className="text-[11px] uppercase tracking-wider text-danger font-medium mb-2">
                Erreurs partielles
              </p>
              <ul className="space-y-1 text-xs text-danger">
                {result.errors.map((e, i) => (
                  <li key={i} className="leading-relaxed">
                    • {e}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PlanView({ plan }: { plan: AdPlan }) {
  return (
    <div className="space-y-5">
      {/* Strategy */}
      <section className="bg-surface border border-border rounded-2xl p-5">
        <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" strokeWidth={1.75} />
          Stratégie globale
        </h2>
        <p className="text-sm text-foreground mb-3 leading-relaxed">{plan.strategy.summary}</p>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <Stat
            label="Budget / jour"
            value={`${plan.strategy.recommendedDailyBudgetKwd} KWD`}
          />
          <Stat label="Durée" value={`${plan.strategy.durationDays} jours`} />
          <Stat label="Budget total" value={`${plan.strategy.totalBudgetKwd} KWD`} />
        </div>
        <Reasoning text={plan.strategy.reasoning} />
        {plan.strategy.keySuccessMetrics?.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-[11px] uppercase tracking-wider text-foreground-subtle mb-1.5 flex items-center gap-1.5">
              <TrendingUp className="w-3 h-3" /> KPIs cibles
            </p>
            <div className="flex flex-wrap gap-1.5">
              {plan.strategy.keySuccessMetrics.map((m, i) => (
                <span
                  key={i}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-success-soft text-success"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Campaign */}
      <section className="bg-surface border border-border rounded-2xl p-5">
        <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-accent" strokeWidth={1.75} />
          Campagne
        </h2>
        <FieldRow label="Nom de la campagne" value={plan.campaign.name} mono />
        <FieldRow label="Objectif" value={plan.campaign.objective} mono />
        <FieldRow label="Label objectif (UI Meta)" value={plan.campaign.objectiveLabel} />
        <FieldRow label="Buying type" value={plan.campaign.buyingType} mono />
        <FieldRow label="Special ad category" value={plan.campaign.specialAdCategory} mono />
        <FieldRow
          label="Type de budget"
          value={plan.campaign.budgetType === "campaign_budget" ? "CBO (Campaign Budget Optimization)" : "ABO (Ad Set Budget)"}
        />
        <Reasoning text={plan.campaign.objectiveReasoning} />
      </section>

      {/* Ad Sets */}
      {plan.adSets.map((adSet, i) => (
        <section key={i} className="bg-surface border border-border rounded-2xl p-5">
          <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
            <Layers className="w-4 h-4 text-accent" strokeWidth={1.75} />
            Ad Set {i + 1}
          </h2>
          <FieldRow label="Nom" value={adSet.name} mono />
          <FieldRow
            label="Budget / jour"
            value={`${adSet.dailyBudgetKwd} KWD`}
          />
          <FieldRow label="Objectif d'optimisation" value={adSet.optimizationGoal} mono />
          <FieldRow label="Planning" value={adSet.schedule} />

          <div className="mt-4 pt-3 border-t border-border space-y-3">
            <p className="text-[11px] uppercase tracking-wider text-foreground-subtle flex items-center gap-1.5">
              <Users className="w-3 h-3" /> Audience
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-foreground-subtle mb-1">
                  Âge
                </p>
                <p className="text-foreground">
                  {adSet.audience.ageMin}–{adSet.audience.ageMax}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-foreground-subtle mb-1">
                  Genre
                </p>
                <p className="text-foreground">
                  {adSet.audience.genders.join(", ")}
                </p>
              </div>
            </div>
            <ChipList
              label="Pays"
              icon={MapPin}
              items={adSet.audience.locations}
              color="info"
            />
            <ChipList
              label="Langues"
              items={adSet.audience.languages}
              color="muted"
            />
            <ChipList
              label="Intérêts détaillés"
              items={adSet.audience.detailedTargeting.interests}
              color="accent"
            />
            {adSet.audience.detailedTargeting.behaviors?.length > 0 && (
              <ChipList
                label="Comportements"
                items={adSet.audience.detailedTargeting.behaviors}
                color="muted"
              />
            )}
            {adSet.audience.detailedTargeting.demographics?.length > 0 && (
              <ChipList
                label="Démographie"
                items={adSet.audience.detailedTargeting.demographics}
                color="muted"
              />
            )}
            {adSet.audience.exclude?.length > 0 && (
              <ChipList
                label="Exclure"
                items={adSet.audience.exclude}
                color="danger"
              />
            )}
            <Reasoning text={adSet.audience.audienceReasoning} />
          </div>

          <div className="mt-4 pt-3 border-t border-border">
            <ChipList
              label="Placements"
              items={adSet.placements}
              color="accent"
            />
            <Reasoning text={adSet.placementsReasoning} />
          </div>

          <Reasoning text={adSet.optimizationReasoning} />
        </section>
      ))}

      {/* Ad Variants */}
      <section className="bg-surface border border-border rounded-2xl p-5">
        <h2 className="font-display text-lg font-semibold mb-1 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" strokeWidth={1.75} />
          3 variantes d&apos;annonces (A / B / C)
        </h2>
        <p className="text-xs text-foreground-muted mb-4">
          Lance les 3 en même temps dans le même ad set — Meta optimise vers la meilleure.
        </p>
        <div className="space-y-4">
          {plan.adVariants.map((v, i) => (
            <AdVariantCard key={i} variant={v} />
          ))}
        </div>
      </section>

      {/* Pixel events */}
      <section className="bg-surface border border-border rounded-2xl p-5">
        <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-accent" strokeWidth={1.75} />
          Meta Pixel — événements à optimiser
        </h2>
        <FieldRow label="Événement principal" value={plan.metaPixelEvents.primary} mono />
        <ChipList
          label="Événements secondaires"
          items={plan.metaPixelEvents.secondary}
          color="muted"
        />
        <Reasoning text={plan.metaPixelEvents.reasoning} />
      </section>

      {/* Checklist */}
      <section className="bg-surface border border-border rounded-2xl p-5">
        <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-accent" strokeWidth={1.75} />
          Checklist copier-coller — Ads Manager
        </h2>
        <ol className="space-y-2 list-decimal list-inside text-sm text-foreground">
          {plan.copyPasteChecklist.map((step, i) => (
            <li key={i} className="leading-relaxed">
              {step}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function AdVariantCard({
  variant,
}: {
  variant: AdPlan["adVariants"][number];
}) {
  const variantColor: Record<string, string> = {
    A: "bg-info-soft text-info",
    B: "bg-success-soft text-success",
    C: "bg-warning-soft text-warning",
  };

  return (
    <div className="border border-border rounded-xl p-4 hover:border-accent/40 transition-colors">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-sm font-display font-semibold px-2.5 py-0.5 rounded-full ${variantColor[variant.variant] ?? "bg-surface-muted text-foreground-muted"}`}
          >
            Variant {variant.variant}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-surface-muted text-foreground-muted">
            {variant.angle}
          </span>
          <span
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${variant.scrollStopScore >= 8 ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}
            title="Scroll-Stop Score (force du hook)"
          >
            Hook {variant.scrollStopScore}/10
          </span>
        </div>
      </div>
      <p className="text-[11px] text-foreground-subtle mb-3 italic">
        {variant.angleReasoning}
      </p>

      <CopyField label="Primary text — Arabe (à coller)" value={variant.primaryText.ar} rtl multiline />
      <CopyField label="Primary text — Français (review)" value={variant.primaryText.fr} multiline subtle />
      <CopyField label="Headline — Arabe" value={variant.headline.ar} rtl />
      <CopyField label="Headline — Français" value={variant.headline.fr} subtle />
      <CopyField label="Description — Arabe" value={variant.description.ar} rtl />
      <CopyField label="Description — Français" value={variant.description.fr} subtle />
      <div className="grid grid-cols-2 gap-2 mt-2">
        <CopyField label="Bouton CTA Meta" value={variant.cta} mono small />
        <CopyField label="Label CTA (FR)" value={variant.ctaLabel} small />
      </div>
      <CopyField label="URL destination (avec UTM)" value={variant.destinationUrl} mono small />

      <div className="mt-3 pt-3 border-t border-border">
        <p className="text-[11px] uppercase tracking-wider text-foreground-subtle mb-1.5">
          📸 Recommandation visuel
        </p>
        <p className="text-sm text-foreground italic">{variant.creativeRecommendation}</p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-muted rounded-lg p-3">
      <p className="text-[10px] uppercase tracking-wider text-foreground-subtle">{label}</p>
      <p className="font-display text-lg font-semibold text-foreground mt-0.5 tabular-nums">
        {value}
      </p>
    </div>
  );
}

function FieldRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-foreground-subtle">{label}</p>
        <p
          className={`text-sm text-foreground mt-0.5 break-words ${mono ? "font-mono" : ""}`}
        >
          {value}
        </p>
      </div>
      <button
        onClick={copy}
        className="text-xs text-accent hover:text-accent-hover flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-accent-soft transition-colors shrink-0"
      >
        {copied ? (
          <>
            <Check className="w-3.5 h-3.5" /> Copié
          </>
        ) : (
          <>
            <Copy className="w-3.5 h-3.5" />
          </>
        )}
      </button>
    </div>
  );
}

function CopyField({
  label,
  value,
  mono = false,
  small = false,
  multiline = false,
  rtl = false,
  subtle = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  small?: boolean;
  multiline?: boolean;
  rtl?: boolean;
  subtle?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] uppercase tracking-wider text-foreground-subtle">{label}</p>
        <button
          onClick={copy}
          className="text-[11px] text-accent hover:text-accent-hover flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-accent-soft"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3" /> Copié
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" /> Copier
            </>
          )}
        </button>
      </div>
      <div
        dir={rtl ? "rtl" : "ltr"}
        className={`px-3 py-2 rounded-lg break-words ${subtle ? "bg-surface-muted/50" : "bg-surface-muted"} ${rtl ? "text-right" : "text-left"} ${small ? "text-xs" : "text-sm"} ${mono ? "font-mono" : ""} ${multiline ? "whitespace-pre-wrap leading-relaxed" : ""} ${subtle ? "text-foreground-muted italic" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}

function ChipList({
  label,
  icon: Icon,
  items,
  color = "muted",
}: {
  label: string;
  icon?: typeof MapPin;
  items: string[];
  color?: "muted" | "accent" | "info" | "danger" | "success";
}) {
  if (!items || items.length === 0) return null;
  const colorMap: Record<string, string> = {
    muted: "bg-surface-muted text-foreground-muted",
    accent: "bg-accent-soft text-accent",
    info: "bg-info-soft text-info",
    danger: "bg-danger-soft text-danger",
    success: "bg-success-soft text-success",
  };
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-foreground-subtle mb-1.5 flex items-center gap-1.5">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <span
            key={i}
            className={`text-[11px] px-2 py-0.5 rounded-full ${colorMap[color]}`}
          >
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

function Reasoning({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="mt-3 pt-3 border-t border-border">
      <p className="text-[11px] uppercase tracking-wider text-foreground-subtle mb-1.5">
        💡 Pourquoi
      </p>
      <p className="text-xs text-foreground-muted italic leading-relaxed">{text}</p>
    </div>
  );
}
