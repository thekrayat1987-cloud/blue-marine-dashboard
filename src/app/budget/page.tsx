"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Package,
  TrendingUp,
  TrendingDown,
  Target,
  Wallet,
  Loader2,
  RefreshCw,
  ShoppingBag,
  Trophy,
  AlertCircle,
} from "lucide-react";
import { useAnnualGoal } from "@/hooks/useAnnualGoal";

const CHANNEL_COLORS: Record<string, string> = {
  meta: "#1877f2",
  google: "#ea4335",
  snapchat: "#fffc00",
  tiktok: "#000000",
  whatsapp: "#25d366",
  email: "#22c55e",
  organic_social: "#e1306c",
  direct: "#94a3b8",
};

interface ChannelRow {
  key: string;
  label: string;
  revenue30d: number;
  orders30d: number;
}

interface CategoryRow {
  productType: string;
  revenue30d: number;
  orders30d: number;
  avgPrice: number;
  quantity: number;
  isBestSeller: boolean;
}

interface BudgetData {
  goalProgress: {
    annualGoal: number;
    ytdRevenue: number;
    ytdOrders: number;
    progressPct: number;
    daysElapsed: number;
    daysTotal: number;
    expectedProgressPct: number;
    projection: number;
    paceStatus: "ahead" | "behind" | "on_track";
  } | null;
  currentMonth: {
    revenue: number;
    orders: number;
    averageOrderValue: number;
    monthlyTarget: number;
    progressPct: number;
  } | null;
  channels: ChannelRow[];
  categories: CategoryRow[];
  currency: string;
  ytdOrdersScanned: number;
  meta: { spendLast30d: number; revenuePixel: number; conversionsPixel: number; roasPixel: number } | null;
  snapchat: { spendLifetime: number; impressions: number; swipes: number } | null;
  error?: string;
}

function formatKD(n: number): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

function formatKDPrecise(n: number): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

export default function BudgetPage() {
  const { goal: annualGoal } = useAnnualGoal();
  const [data, setData] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/budget?goal=${annualGoal}`);
      const json = (await res.json()) as BudgetData;
      setData(json);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [annualGoal]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Build ROAS table by joining Meta/Snap spend with Shopify-attributed revenue
  const roasRows = useMemo(() => {
    if (!data) return [];
    const rows: Array<{
      channel: string;
      label: string;
      spend: number | null;
      revenue: number;
      orders: number;
      roas: number | null;
      note?: string;
    }> = [];

    const findRevenue = (key: string) =>
      data.channels.find((c) => c.key === key) ?? { revenue30d: 0, orders30d: 0 };

    const metaRev = findRevenue("meta");
    const metaSpend = data.meta?.spendLast30d ?? null;
    rows.push({
      channel: "meta",
      label: "Meta Ads (FB/IG)",
      spend: metaSpend,
      revenue: metaRev.revenue30d,
      orders: metaRev.orders30d,
      roas: metaSpend && metaSpend > 0 ? metaRev.revenue30d / metaSpend : null,
      note: "Dépense Meta 30j / Revenu attribué 30j (UTM Shopify)",
    });

    const snapRev = findRevenue("snapchat");
    const snapSpend = data.snapchat?.spendLifetime ?? null;
    rows.push({
      channel: "snapchat",
      label: "Snapchat Ads",
      spend: snapSpend,
      revenue: snapRev.revenue30d,
      orders: snapRev.orders30d,
      roas: null,
      note: snapSpend !== null
        ? "Dépense Snap durée de vie (l'API ne fournit pas 30j) — ROAS non calculable"
        : "Non connecté",
    });

    const waRev = findRevenue("whatsapp");
    rows.push({
      channel: "whatsapp",
      label: "WhatsApp",
      spend: 0,
      revenue: waRev.revenue30d,
      orders: waRev.orders30d,
      roas: null,
      note: "Canal organique — aucune dépense ads directe",
    });

    const organicRev = findRevenue("organic_social");
    if (organicRev.revenue30d > 0) {
      rows.push({
        channel: "organic_social",
        label: "Social organique (IG/FB)",
        spend: 0,
        revenue: organicRev.revenue30d,
        orders: organicRev.orders30d,
        roas: null,
        note: "Trafic IG/FB non payé",
      });
    }
    const directRev = findRevenue("direct");
    if (directRev.revenue30d > 0) {
      rows.push({
        channel: "direct",
        label: "Direct / Inconnu",
        spend: 0,
        revenue: directRev.revenue30d,
        orders: directRev.orders30d,
        roas: null,
        note: "Pas d'UTM source détecté",
      });
    }
    return rows;
  }, [data]);

  const goal = data?.goalProgress;

  return (
    <div className="flex-1 overflow-auto">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Performance & Rentabilité</h1>
            <p className="text-sm text-foreground-muted mt-0.5">
              Objectif annuel, retour sur dépenses pub et catégories qui vendent
            </p>
          </div>
          <button
            onClick={fetchAll}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-muted hover:bg-surface text-xs text-foreground-muted transition-colors disabled:opacity-50"
          >
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Actualiser
          </button>
        </div>
      </header>

      <div className="p-8 space-y-8">
        {data?.error && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-600 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Erreur Shopify : {data.error}</span>
          </div>
        )}

        {/* Annual Goal Progress */}
        <div className="rounded-2xl bg-surface border border-border p-6 md:p-8 relative overflow-hidden">
          <div className="absolute top-0 left-8 right-8 h-px gold-rule" />
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-accent font-medium">
                Objectif {new Date().getFullYear()}
              </p>
              <h2 className="font-display text-3xl md:text-4xl font-semibold text-foreground mt-2 tabular-nums">
                {loading || !goal ? "…" : `${formatKD(goal.ytdRevenue)} / ${formatKD(goal.annualGoal)} KD`}
              </h2>
              <p className="text-sm text-foreground-muted mt-1">
                {goal ? `${goal.ytdOrders} commandes · ${goal.daysElapsed}/${goal.daysTotal} jours écoulés` : "Chargement…"}
              </p>
            </div>
            {goal && (
              <div className="flex items-center gap-3">
                {goal.paceStatus === "ahead" ? (
                  <div className="px-3 py-1.5 rounded-lg bg-green-500/15 border border-green-500/30 text-green-600 text-xs font-semibold flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5" />
                    En avance sur l&apos;objectif
                  </div>
                ) : goal.paceStatus === "behind" ? (
                  <div className="px-3 py-1.5 rounded-lg bg-orange-500/15 border border-orange-500/30 text-orange-600 text-xs font-semibold flex items-center gap-1.5">
                    <TrendingDown className="w-3.5 h-3.5" />
                    En retard sur l&apos;objectif
                  </div>
                ) : (
                  <div className="px-3 py-1.5 rounded-lg bg-accent-soft border border-accent/30 text-accent text-xs font-semibold flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5" />
                    Sur le rythme
                  </div>
                )}
              </div>
            )}
          </div>

          {goal && (
            <>
              {/* Progress bar */}
              <div className="mt-6">
                <div className="relative h-3 rounded-full bg-surface-muted overflow-hidden">
                  {/* Expected progress marker */}
                  <div
                    className="absolute top-0 bottom-0 w-px bg-foreground-subtle/40 z-10"
                    style={{ left: `${Math.min(goal.expectedProgressPct, 100)}%` }}
                  />
                  {/* Actual progress */}
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      goal.paceStatus === "ahead"
                        ? "bg-gradient-to-r from-accent to-green-500"
                        : goal.paceStatus === "behind"
                        ? "bg-gradient-to-r from-orange-500 to-accent"
                        : "bg-gradient-to-r from-accent to-accent"
                    }`}
                    style={{ width: `${Math.min(goal.progressPct, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-[11px] text-foreground-subtle">
                  <span>{goal.progressPct.toFixed(1)}% atteint</span>
                  <span>Repère temps écoulé : {goal.expectedProgressPct.toFixed(1)}%</span>
                  <span>100% = {formatKD(goal.annualGoal)} KD</span>
                </div>
              </div>

              {/* Projection */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                <div className="px-4 py-3 rounded-lg bg-surface-muted border border-border">
                  <p className="text-[10px] uppercase tracking-wider text-foreground-subtle font-medium">
                    À ce rythme, fin d&apos;année
                  </p>
                  <p className="text-xl font-bold text-foreground mt-1 tabular-nums">
                    {formatKD(goal.projection)} KD
                  </p>
                  <p className="text-[11px] mt-0.5 text-foreground-muted">
                    {goal.projection >= goal.annualGoal ? (
                      <span className="text-green-600">
                        +{formatKD(goal.projection - goal.annualGoal)} KD au-dessus de l&apos;objectif
                      </span>
                    ) : (
                      <span className="text-orange-600">
                        −{formatKD(goal.annualGoal - goal.projection)} KD sous l&apos;objectif
                      </span>
                    )}
                  </p>
                </div>
                <div className="px-4 py-3 rounded-lg bg-surface-muted border border-border">
                  <p className="text-[10px] uppercase tracking-wider text-foreground-subtle font-medium">
                    Restant à faire
                  </p>
                  <p className="text-xl font-bold text-foreground mt-1 tabular-nums">
                    {formatKD(Math.max(0, goal.annualGoal - goal.ytdRevenue))} KD
                  </p>
                  <p className="text-[11px] mt-0.5 text-foreground-muted">
                    sur {goal.daysTotal - goal.daysElapsed} jours restants
                  </p>
                </div>
                <div className="px-4 py-3 rounded-lg bg-surface-muted border border-border">
                  <p className="text-[10px] uppercase tracking-wider text-foreground-subtle font-medium">
                    Rythme quotidien nécessaire
                  </p>
                  <p className="text-xl font-bold text-foreground mt-1 tabular-nums">
                    {goal.daysTotal - goal.daysElapsed > 0
                      ? formatKDPrecise(
                          Math.max(0, goal.annualGoal - goal.ytdRevenue) /
                            (goal.daysTotal - goal.daysElapsed),
                        )
                      : "—"}{" "}
                    KD/jour
                  </p>
                  <p className="text-[11px] mt-0.5 text-foreground-muted">
                    pour boucler l&apos;objectif
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Current month + ROAS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Current month card */}
          <div className="rounded-xl bg-surface border border-border p-6">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-semibold text-foreground">Mois en cours</h2>
            </div>
            <p className="text-xs text-foreground-subtle mb-4">
              {new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
            </p>
            {data?.currentMonth ? (
              <>
                <p className="font-display text-3xl font-semibold text-foreground tabular-nums">
                  {formatKD(data.currentMonth.revenue)} KD
                </p>
                <p className="text-xs text-foreground-muted mt-1">
                  sur {formatKD(data.currentMonth.monthlyTarget)} KD ({data.currentMonth.progressPct.toFixed(0)}%)
                </p>
                <div className="mt-4 h-2 rounded-full bg-surface-muted overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(data.currentMonth.progressPct, 100)}%` }}
                  />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-foreground-subtle">Commandes</p>
                    <p className="text-foreground font-semibold tabular-nums">{data.currentMonth.orders}</p>
                  </div>
                  <div>
                    <p className="text-foreground-subtle">Panier moyen</p>
                    <p className="text-foreground font-semibold tabular-nums">
                      {formatKD(data.currentMonth.averageOrderValue)} KD
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-foreground-subtle">Chargement…</p>
            )}
          </div>

          {/* ROAS table */}
          <div className="lg:col-span-2 rounded-xl bg-surface border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center gap-2">
              <Target className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-semibold text-foreground">Retour sur dépenses pub (30 derniers jours)</h2>
            </div>
            {roasRows.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-foreground-subtle">
                {loading ? "Chargement…" : "Aucune donnée à afficher"}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-foreground-subtle border-b border-border">
                    <th className="px-6 py-3 font-medium">Canal</th>
                    <th className="px-4 py-3 font-medium text-right">Dépensé</th>
                    <th className="px-4 py-3 font-medium text-right">Revenu attribué</th>
                    <th className="px-4 py-3 font-medium text-right">Commandes</th>
                    <th className="px-6 py-3 font-medium text-right">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {roasRows.map((r) => (
                    <tr key={r.channel} className="border-b border-border hover:bg-surface-muted transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: CHANNEL_COLORS[r.channel] ?? "#94a3b8" }}
                          />
                          <div>
                            <p className="text-foreground font-medium">{r.label}</p>
                            {r.note && (
                              <p className="text-[10px] text-foreground-subtle leading-tight mt-0.5">{r.note}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right text-foreground tabular-nums">
                        {r.spend === null ? (
                          <span className="text-foreground-subtle">—</span>
                        ) : r.spend === 0 ? (
                          <span className="text-foreground-subtle">0</span>
                        ) : (
                          `${formatKD(r.spend)} KD`
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right text-foreground tabular-nums">
                        {r.revenue > 0 ? `${formatKD(r.revenue)} KD` : <span className="text-foreground-subtle">0</span>}
                      </td>
                      <td className="px-4 py-3.5 text-right text-foreground tabular-nums">{r.orders}</td>
                      <td className="px-6 py-3.5 text-right">
                        {r.roas === null ? (
                          <span className="text-foreground-subtle">—</span>
                        ) : (
                          <span
                            className={`font-semibold tabular-nums ${
                              r.roas >= 4
                                ? "text-green-600"
                                : r.roas >= 2
                                ? "text-accent"
                                : "text-orange-600"
                            }`}
                          >
                            {r.roas.toFixed(1)}x
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="px-6 py-3 text-[10px] text-foreground-subtle border-t border-border bg-surface-muted/40">
              ROAS cible : ≥ 4x. Vert ≥ 4x · Or 2-4x · Orange &lt; 2x. Revenu attribué basé sur le UTM source dans Shopify customerJourneySummary.
            </div>
          </div>
        </div>

        {/* Categories */}
        <div className="rounded-xl bg-surface border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <Package className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">
              Catégories qui vendent (30 derniers jours)
            </h2>
            <span className="text-xs text-foreground-subtle ml-auto">
              Données réelles Shopify · {data?.categories.length ?? 0} catégorie{(data?.categories.length ?? 0) > 1 ? "s" : ""}
            </span>
          </div>
          {!data?.categories.length ? (
            <div className="px-6 py-10 text-center text-sm text-foreground-subtle">
              {loading ? (
                "Chargement…"
              ) : (
                <>
                  Aucune commande dans les 30 derniers jours.<br />
                  Renseigne le <span className="font-mono">productType</span> sur tes produits Shopify pour qu&apos;ils apparaissent ici.
                </>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-foreground-subtle border-b border-border">
                  <th className="px-6 py-3 font-medium">Catégorie (productType Shopify)</th>
                  <th className="px-4 py-3 font-medium text-right">Quantité vendue</th>
                  <th className="px-4 py-3 font-medium text-right">Prix moyen</th>
                  <th className="px-4 py-3 font-medium text-right">CA 30j</th>
                  <th className="px-6 py-3 font-medium text-center">Vedette</th>
                </tr>
              </thead>
              <tbody>
                {data.categories.map((c) => (
                  <tr key={c.productType} className="border-b border-border hover:bg-surface-muted transition-colors">
                    <td className="px-6 py-3.5 font-medium text-foreground">{c.productType}</td>
                    <td className="px-4 py-3.5 text-right text-foreground tabular-nums">{c.quantity}</td>
                    <td className="px-4 py-3.5 text-right text-foreground tabular-nums">
                      {formatKD(c.avgPrice)} KD
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold text-foreground tabular-nums">
                      {formatKD(c.revenue30d)} KD
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      {c.isBestSeller ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent-soft text-accent">
                          <Trophy className="w-3 h-3" />
                          Vedette
                        </span>
                      ) : (
                        <span className="text-foreground-subtle">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer note */}
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-surface-muted/50 border border-dashed border-border text-xs text-foreground-muted">
          <ShoppingBag className="w-4 h-4 mt-0.5 shrink-0 text-foreground-subtle" />
          <p>
            Pour améliorer l&apos;attribution Meta/Snapchat : assure-toi que tes pubs incluent l&apos;UTM template
            (<code className="px-1 py-0.5 rounded bg-surface-muted">utm_source=&#123;site_source_name&#125;</code>) dans
            le champ &laquo;&nbsp;Paramètres d&apos;URL&nbsp;&raquo;. Sans UTM, les ventes apparaissent en
            &laquo;&nbsp;Direct&nbsp;&raquo;.
          </p>
        </div>
      </div>
    </div>
  );
}
