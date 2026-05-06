"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Coins,
  ShoppingCart,
  TrendingUp,
  Users,
  RefreshCw,
  Loader2,
  Repeat,
  Moon,
  Trophy,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import KPICard from "@/components/KPICard";

interface Analytics {
  range: { start: string; end: string; days: number };
  totals: {
    revenue: number;
    orders: number;
    averageOrderValue: number;
    uniqueCustomers: number;
    repeatCustomers: number;
    repeatCustomerRate: number;
  };
  daily: Array<{ date: string; revenue: number; orders: number }>;
  weekly: Array<{ weekStart: string; label: string; revenue: number; orders: number }>;
  monthly: Array<{ month: string; revenue: number; orders: number }>;
  topProducts: Array<{
    productId: string | null;
    title: string;
    sku: string | null;
    quantity: number;
    revenue: number;
  }>;
  ramadanComparison: {
    ramadan: { label: string; start: string; end: string; revenue: number; orders: number; aov: number; dailyAvg: number };
    normal: { label: string; start: string; end: string; revenue: number; orders: number; aov: number; dailyAvg: number };
    lift: { revenuePct: number; ordersPct: number; aovPct: number };
  } | null;
  currency: string;
  lastUpdated: string;
}

const RANGES = [
  { days: 7, label: "7 jours" },
  { days: 30, label: "30 jours" },
  { days: 90, label: "90 jours" },
  { days: 365, label: "1 an" },
];

const fmtKd = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} KD`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", timeZone: "UTC" });

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"daily" | "weekly" | "monthly">("daily");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/analytics?days=${days}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-pick view based on range
  useEffect(() => {
    if (days <= 30) setView("daily");
    else if (days <= 90) setView("weekly");
    else setView("monthly");
  }, [days]);

  const chartData: Array<{ label: string; revenue: number; orders: number }> =
    view === "daily"
      ? (data?.daily ?? []).map((d) => ({ label: fmtDate(d.date), revenue: d.revenue, orders: d.orders }))
      : view === "weekly"
        ? (data?.weekly ?? []).map((w) => ({ label: w.label, revenue: w.revenue, orders: w.orders }))
        : (data?.monthly ?? []).map((m) => ({ label: m.month, revenue: m.revenue, orders: m.orders }));

  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur-md px-8 py-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-accent font-medium mb-1">
              Atelier · Analyses
            </p>
            <h1 className="font-display text-3xl font-semibold text-foreground">
              Ventes et performance
            </h1>
            <p className="text-sm text-foreground-muted mt-1">
              Évolution du chiffre d&apos;affaires, produits phares et comparaison Ramadan
            </p>
          </div>
          <div className="flex items-center gap-3">
            {data?.lastUpdated && (
              <span className="text-[11px] text-foreground-subtle">
                Mis à jour à {new Date(data.lastUpdated).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-muted hover:bg-surface text-xs text-foreground-muted transition-colors disabled:opacity-50 border border-border"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Actualiser
            </button>
          </div>
        </div>

        {/* Range tabs */}
        <div className="mt-4 flex items-center gap-2">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                days === r.days
                  ? "bg-accent-soft text-accent font-medium border border-accent/30"
                  : "bg-surface-muted text-foreground-muted hover:text-foreground border border-transparent"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-3 text-xs text-orange-400 bg-orange-500/10 px-3 py-2 rounded-lg">
            Erreur Shopify — {error}
          </div>
        )}
      </header>

      <div className="p-8 space-y-8">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <KPICard
            label="Chiffre d'affaires"
            value={fmtKd(data?.totals.revenue ?? 0)}
            subtitle={`${data?.range.days ?? days} derniers jours`}
            icon={Coins}
            loading={loading && !data}
          />
          <KPICard
            label="Commandes"
            value={(data?.totals.orders ?? 0).toLocaleString("fr-FR")}
            subtitle={`Sur ${data?.range.days ?? days} jours`}
            icon={ShoppingCart}
            loading={loading && !data}
          />
          <KPICard
            label="Panier moyen"
            value={fmtKd(data?.totals.averageOrderValue ?? 0)}
            subtitle="Valeur par commande"
            icon={TrendingUp}
            loading={loading && !data}
          />
          <KPICard
            label="Clientes uniques"
            value={(data?.totals.uniqueCustomers ?? 0).toLocaleString("fr-FR")}
            subtitle={`${data?.totals.repeatCustomers ?? 0} fidèles`}
            icon={Users}
            loading={loading && !data}
          />
          <KPICard
            label="Taux de fidélité"
            value={`${data?.totals.repeatCustomerRate ?? 0}%`}
            subtitle="Clientes ≥ 2 commandes"
            icon={Repeat}
            loading={loading && !data}
          />
        </div>

        {/* Revenue chart */}
        <section className="rounded-2xl bg-surface border border-border p-6">
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-foreground">
                Évolution du chiffre d&apos;affaires
              </h2>
              <p className="text-xs text-foreground-muted mt-0.5">
                Vue {view === "daily" ? "journalière" : view === "weekly" ? "hebdomadaire" : "mensuelle"} en KD
              </p>
            </div>
            <div className="flex items-center gap-1 bg-surface-muted rounded-lg p-1">
              {(["daily", "weekly", "monthly"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1 rounded-md text-[11px] transition-colors ${
                    view === v
                      ? "bg-background text-foreground shadow-sm"
                      : "text-foreground-muted hover:text-foreground"
                  }`}
                >
                  {v === "daily" ? "Jour" : v === "weekly" ? "Semaine" : "Mois"}
                </button>
              ))}
            </div>
          </div>

          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#c8a96e" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#c8a96e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#7d7867" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#7d7867" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}`}
                />
                <Tooltip
                  formatter={(v) => [fmtKd(Number(v)), "Revenu"]}
                  contentStyle={{
                    background: "var(--surface, #fff)",
                    border: "1px solid var(--border, #ddd)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#c8a96e"
                  strokeWidth={2}
                  fill="url(#revenueGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-sm text-foreground-subtle">
              Aucune donnée pour cette période
            </div>
          )}
        </section>

        {/* Orders bar chart + Top products */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-1 rounded-2xl bg-surface border border-border p-6">
            <h2 className="font-display text-lg font-semibold text-foreground mb-1">
              Volume de commandes
            </h2>
            <p className="text-xs text-foreground-muted mb-4">
              Nombre de commandes par {view === "daily" ? "jour" : view === "weekly" ? "semaine" : "mois"}
            </p>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "#7d7867" }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#7d7867" }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    formatter={(v) => [String(v), "Commandes"]}
                    contentStyle={{
                      background: "var(--surface, #fff)",
                      border: "1px solid var(--border, #ddd)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="orders" fill="#1e3a5f" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[260px] flex items-center justify-center text-sm text-foreground-subtle">
                Aucune donnée
              </div>
            )}
          </section>

          <section className="lg:col-span-2 rounded-2xl bg-surface border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-accent" strokeWidth={1.75} />
                <h2 className="font-display text-lg font-semibold text-foreground">
                  Produits phares
                </h2>
              </div>
              <span className="text-[11px] text-foreground-subtle">
                Top 10 · {data?.range.days ?? days} jours
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-foreground-subtle">
                    <th className="px-6 py-3 font-medium">#</th>
                    <th className="px-6 py-3 font-medium">Produit</th>
                    <th className="px-6 py-3 font-medium text-right">Quantité</th>
                    <th className="px-6 py-3 font-medium text-right">Revenu</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.topProducts.length ? (
                    data.topProducts.map((p, i) => (
                      <tr key={p.productId ?? p.title} className="border-t border-border hover:bg-surface-muted/50">
                        <td className="px-6 py-3 text-foreground-subtle font-medium tabular-nums">
                          {i + 1}
                        </td>
                        <td className="px-6 py-3">
                          <div className="text-foreground font-medium">{p.title}</div>
                          {p.sku && (
                            <div className="text-[11px] text-foreground-subtle mt-0.5">
                              SKU · {p.sku}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-3 text-right tabular-nums text-foreground-muted">
                          {p.quantity}
                        </td>
                        <td className="px-6 py-3 text-right tabular-nums font-medium text-foreground">
                          {fmtKd(p.revenue)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-sm text-foreground-subtle">
                        {loading ? "Chargement…" : "Aucune commande sur cette période"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Ramadan comparison */}
        {data?.ramadanComparison ? (
          <section className="rounded-2xl bg-gradient-to-br from-accent-soft/40 to-surface border border-accent/30 p-6">
            <div className="flex items-center gap-2 mb-1">
              <Moon className="w-5 h-5 text-accent" strokeWidth={1.75} />
              <h2 className="font-display text-lg font-semibold text-foreground">
                Ramadan vs période normale
              </h2>
            </div>
            <p className="text-xs text-foreground-muted mb-5">
              {data.ramadanComparison.ramadan.label} ({fmtDate(data.ramadanComparison.ramadan.start)} → {fmtDate(data.ramadanComparison.ramadan.end)})
              · comparé aux mêmes nombre de jours juste avant
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ComparisonCell
                label="Chiffre d'affaires"
                ramadan={fmtKd(data.ramadanComparison.ramadan.revenue)}
                ramadanSub={`${fmtKd(data.ramadanComparison.ramadan.dailyAvg)}/jour`}
                normal={fmtKd(data.ramadanComparison.normal.revenue)}
                normalSub={`${fmtKd(data.ramadanComparison.normal.dailyAvg)}/jour`}
                liftPct={data.ramadanComparison.lift.revenuePct}
              />
              <ComparisonCell
                label="Commandes"
                ramadan={data.ramadanComparison.ramadan.orders.toLocaleString("fr-FR")}
                normal={data.ramadanComparison.normal.orders.toLocaleString("fr-FR")}
                liftPct={data.ramadanComparison.lift.ordersPct}
              />
              <ComparisonCell
                label="Panier moyen"
                ramadan={fmtKd(data.ramadanComparison.ramadan.aov)}
                normal={fmtKd(data.ramadanComparison.normal.aov)}
                liftPct={data.ramadanComparison.lift.aovPct}
              />
            </div>
          </section>
        ) : days >= 90 && !loading && data ? (
          <section className="rounded-2xl bg-surface border border-dashed border-border p-6 text-center">
            <Moon className="w-6 h-6 text-foreground-subtle mx-auto mb-2" strokeWidth={1.5} />
            <p className="text-sm text-foreground-muted">
              Aucune période de Ramadan complète dans la fenêtre sélectionnée.
            </p>
            <p className="text-xs text-foreground-subtle mt-1">
              Choisissez « 1 an » pour voir la comparaison Ramadan vs normal.
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function ComparisonCell({
  label,
  ramadan,
  ramadanSub,
  normal,
  normalSub,
  liftPct,
}: {
  label: string;
  ramadan: string;
  ramadanSub?: string;
  normal: string;
  normalSub?: string;
  liftPct: number;
}) {
  const positive = liftPct >= 0;
  return (
    <div className="rounded-xl bg-background border border-border p-4">
      <p className="text-[11px] uppercase tracking-[0.14em] text-foreground-subtle mb-3">
        {label}
      </p>
      <div className="space-y-3">
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-accent font-medium">Ramadan</span>
            <span className="font-display text-xl font-semibold text-foreground tabular-nums">
              {ramadan}
            </span>
          </div>
          {ramadanSub && (
            <p className="text-[10px] text-foreground-subtle text-right mt-0.5">{ramadanSub}</p>
          )}
        </div>
        <div className="border-t border-border pt-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-foreground-muted">Normal</span>
            <span className="text-base font-medium text-foreground-muted tabular-nums">
              {normal}
            </span>
          </div>
          {normalSub && (
            <p className="text-[10px] text-foreground-subtle text-right mt-0.5">{normalSub}</p>
          )}
        </div>
        <div
          className={`text-[11px] font-medium tabular-nums text-center rounded-md py-1.5 ${
            positive ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
          }`}
        >
          {positive ? "↑" : "↓"} {Math.abs(liftPct)}% {positive ? "de plus" : "de moins"} pendant le Ramadan
        </div>
      </div>
    </div>
  );
}
