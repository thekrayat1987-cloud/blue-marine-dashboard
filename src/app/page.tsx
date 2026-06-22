"use client";

import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Target,
  Percent,
  CalendarDays,
  RefreshCw,
  Loader2,
  Users,
  ArrowUpRight,
  AlertCircle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import KPICard from "@/components/KPICard";
import ProgressBar from "@/components/ProgressBar";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useAnnualGoal, DEFAULT_ANNUAL_GOAL } from "@/hooks/useAnnualGoal";
import {
  AVG_ORDER_VALUE,
  monthlyData as staticMonthlyData,
  channelData,
  kpiDefinitions,
  seasonalEvents,
} from "@/data/dashboardData";

const MONTH_FR: Record<string, string> = {
  Jan: "Jan", Feb: "Fév", Mar: "Mar", Apr: "Avr", May: "Mai", Jun: "Juin",
  Jul: "Juil", Aug: "Août", Sep: "Sep", Oct: "Oct", Nov: "Nov", Dec: "Déc",
};

const IMPACT_FR = {
  "very-high": { label: "Très fort", className: "bg-danger-soft text-danger" },
  "high": { label: "Fort", className: "bg-warning-soft text-warning" },
  "medium": { label: "Moyen", className: "bg-info-soft text-info" },
} as const;

const formatCurrency = (n: number) =>
  n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });

export default function Home() {
  const { data, loading, error, refresh } = useDashboardData();
  const { goal: annualGoal, monthly: monthlyGoal } = useAnnualGoal();

  const shopifyConnected = !!data?.shopify;
  const metaConnected = !!data?.meta?.accountInsights && !data?.metaNeedsAuth;
  const igConnected = !!data?.instagram?.profile;

  const targetMultiplier = annualGoal / DEFAULT_ANNUAL_GOAL;
  const monthlyData = staticMonthlyData.map((m) => {
    const real = data?.shopify?.monthlyBreakdown.find((r) => r.month === m.month);
    return {
      ...m,
      monthFr: MONTH_FR[m.month] ?? m.month,
      target: Math.round(m.target * targetMultiplier),
      revenue: real?.revenue ?? m.revenue,
      orders: real?.orders ?? m.orders,
    };
  });

  const totalRevenue = data?.shopify?.totalRevenue ?? 0;
  const totalOrders = data?.shopify?.totalOrders ?? 0;
  const aov = data?.shopify?.averageOrderValue ?? 0;
  const totalAdSpend = data?.meta?.accountInsights?.totalSpend ?? 0;
  const roas = totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0;
  const followers = data?.instagram?.profile?.followers ?? 0;

  const goalProgress = (totalRevenue / annualGoal) * 100;
  const ordersPerMonthTarget = Math.round(monthlyGoal / AVG_ORDER_VALUE);

  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur-md px-8 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-accent font-medium mb-1">
              Atelier · Pilotage {new Date().getFullYear()}
            </p>
            <h1 className="font-display text-3xl font-semibold text-foreground">
              Tableau de bord
            </h1>
            <p className="text-sm text-foreground-muted mt-1">
              Suivi de l&apos;objectif annuel · {formatCurrency(annualGoal)} KD
            </p>
          </div>
          <div className="flex items-center gap-3">
            {data?.lastUpdated && (
              <span className="text-[11px] text-foreground-subtle">
                Mis à jour à {new Date(data.lastUpdated).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button
              onClick={refresh}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-surface hover:border-accent hover:text-accent text-sm text-foreground-muted transition-colors disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Actualiser
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 text-xs text-warning bg-warning-soft px-3 py-2 rounded-lg">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>Connexion API indisponible — les chiffres affichés peuvent être incomplets.</span>
          </div>
        )}
        {data?.metaNeedsAuth && (
          <div className="mt-4 flex items-center justify-between gap-3 text-xs text-warning bg-warning-soft px-3 py-2.5 rounded-lg">
            <span className="flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              Le jeton Meta a expiré. Les données Meta Ads et Instagram ne sont pas disponibles.
            </span>
            <a
              href="/settings"
              className="shrink-0 px-3 py-1.5 rounded-md bg-warning text-white hover:bg-warning/90 transition-colors font-medium"
            >
              Reconnecter →
            </a>
          </div>
        )}
        {data?.errors && data.errors.length > 0 && (
          <div className="mt-2 text-xs text-foreground-muted bg-surface-muted px-3 py-2 rounded-lg">
            APIs sans réponse : {data.errors.join(", ")}
          </div>
        )}
      </header>

      <div className="px-8 py-8 space-y-10 max-w-[1600px]">
        {/* Hero KPIs */}
        <section>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
            <KPICard
              variant="hero"
              label="Chiffre d'affaires"
              value={`${formatCurrency(totalRevenue)} KD`}
              subtitle={`${goalProgress.toFixed(1)}% de l'objectif annuel`}
              icon={DollarSign}
              loading={loading && !data}
              empty={!loading && !shopifyConnected}
              emptyHint="Connectez Shopify pour voir vos ventes"
            />
            <KPICard
              variant="hero"
              label="ROAS — Retour publicitaire"
              value={`${roas.toFixed(1)}×`}
              subtitle={`Cible : ${kpiDefinitions.ROAS.target}×`}
              icon={Target}
              loading={loading && !data}
              empty={!loading && !metaConnected}
              emptyHint="Connectez Meta Ads pour suivre votre ROAS"
            />
          </div>

          {/* Goal progress bar */}
          <div className="rounded-2xl bg-surface border border-border p-6">
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-foreground-subtle font-medium">
                  Progression — Objectif {new Date().getFullYear()}
                </p>
                <p className="font-display text-xl font-semibold text-foreground mt-1 tabular-nums">
                  {formatCurrency(totalRevenue)} <span className="text-foreground-subtle">/ {formatCurrency(annualGoal)} KD</span>
                </p>
              </div>
              <span className="text-2xl font-display font-semibold text-accent tabular-nums">
                {goalProgress.toFixed(1)}%
              </span>
            </div>
            <ProgressBar value={totalRevenue} max={annualGoal} color="bg-accent" size="md" />
          </div>
        </section>

        {/* Secondary KPIs */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold text-foreground">Indicateurs clés</h2>
            <span className="text-[11px] text-foreground-subtle">Mensuel</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard
              label="Commandes"
              value={totalOrders.toLocaleString("fr-FR")}
              subtitle={`Cible : ${ordersPerMonthTarget}/mois`}
              icon={ShoppingCart}
              loading={loading && !data}
              empty={!loading && !shopifyConnected}
            />
            <KPICard
              label="Panier moyen"
              value={aov > 0 ? `${formatCurrency(aov)} KD` : "—"}
              subtitle={`Cible : ${kpiDefinitions.AOV.target} KD`}
              icon={TrendingUp}
              loading={loading && !data}
              empty={!loading && !shopifyConnected}
            />
            <KPICard
              label="Abonnés Instagram"
              value={followers.toLocaleString("fr-FR")}
              subtitle="@bluemarine_atelier"
              icon={Users}
              loading={loading && !data}
              empty={!loading && !igConnected}
              emptyHint="Connectez Instagram"
            />
            <KPICard
              label="Marge brute"
              value={`${kpiDefinitions.marginRate.target}%`}
              subtitle="Cible visée"
              icon={Percent}
            />
          </div>
        </section>

        {/* Revenue Chart */}
        <section className="rounded-2xl bg-surface border border-border p-7">
          <div className="flex items-baseline justify-between mb-1">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Chiffre d&apos;affaires mensuel
            </h2>
            <span className="text-[11px] text-foreground-subtle uppercase tracking-wider">
              Réel vs objectif
            </span>
          </div>
          <p className="text-xs text-foreground-muted mb-6">
            Progression annuelle vers l&apos;objectif de {formatCurrency(annualGoal)} KD
          </p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={monthlyData} barGap={6} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="#e8e2d6" vertical={false} />
                <XAxis
                  dataKey="monthFr"
                  tick={{ fill: "#6b7280", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#6b7280", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: "#ffffff",
                    border: "1px solid #e8e2d6",
                    borderRadius: "10px",
                    color: "#1a2238",
                    fontSize: 12,
                    boxShadow: "0 8px 24px -12px rgba(26, 34, 56, 0.12)",
                  }}
                  cursor={{ fill: "rgba(200, 169, 110, 0.08)" }}
                  formatter={(value) => [`${formatCurrency(Number(value))} KD`, undefined as unknown as string]}
                  labelStyle={{ color: "#6b7280", fontWeight: 500 }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: "#6b7280", paddingTop: 12 }}
                  iconType="circle"
                />
                <Bar dataKey="target" name="Objectif" fill="#e8d5a8" radius={[6, 6, 0, 0]} />
                <Bar dataKey="revenue" name="Réel" fill="#c8a96e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Channels + Seasonal */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <h2 className="font-display text-lg font-semibold text-foreground mb-4">
              Canaux de vente
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {channelData.map((channel) => {
                let currentRevenue = 0;
                let hasSource = false;
                if (channel.name.includes("Instagram")) {
                  hasSource = metaConnected;
                  currentRevenue = data?.meta?.accountInsights?.totalRevenue ?? 0;
                } else if (channel.name.includes("Shopify") || channel.name.includes("E-commerce")) {
                  hasSource = shopifyConnected;
                  currentRevenue = data?.shopify?.totalRevenue ?? 0;
                }
                const channelLabel = channel.name
                  .replace("Instagram / Social", "Instagram & social")
                  .replace("E-commerce (Shopify)", "Boutique Shopify");
                const achievedPct = channel.targetRevenue > 0
                  ? Math.round((currentRevenue / channel.targetRevenue) * 100)
                  : 0;
                return (
                  <div
                    key={channel.name}
                    className="rounded-2xl bg-surface border border-border p-5 hover:border-accent/40 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: channel.color }}
                      />
                      <span className="text-sm font-medium text-foreground">{channelLabel}</span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <p className="font-display text-3xl font-semibold text-foreground tabular-nums">
                        {hasSource ? achievedPct : "—"}<span className="text-lg text-foreground-subtle">%</span>
                      </p>
                      <span className="text-[10px] text-foreground-subtle uppercase tracking-wider">de la cible</span>
                    </div>
                    <p className="text-[11px] text-foreground-muted mt-1 tabular-nums">
                      Part visée : {channel.percentage}% · Cible {formatCurrency(channel.targetRevenue)} KD
                    </p>
                    <div className="mt-4">
                      <ProgressBar value={currentRevenue} max={channel.targetRevenue} color="bg-accent" size="sm" />
                    </div>
                    <p className="text-[11px] mt-2 tabular-nums">
                      {hasSource ? (
                        <span className="text-accent font-medium">
                          {formatCurrency(Math.round(currentRevenue))} KD réalisés
                        </span>
                      ) : (
                        <span className="text-foreground-subtle">En attente de données</span>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h2 className="font-display text-lg font-semibold text-foreground mb-4">
              Temps forts
            </h2>
            <div className="rounded-2xl bg-surface border border-border p-2">
              {seasonalEvents.map((event, idx) => {
                const impact = IMPACT_FR[event.impact as keyof typeof IMPACT_FR];
                return (
                  <div
                    key={event.name}
                    className={`flex items-center justify-between px-4 py-3 ${idx !== seasonalEvents.length - 1 ? "border-b border-border" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <CalendarDays className="w-4 h-4 text-accent mt-0.5 shrink-0" strokeWidth={1.75} />
                      <div>
                        <p className="text-sm font-medium text-foreground">{event.name}</p>
                        <p className="text-[11px] text-foreground-subtle mt-0.5">{event.month}</p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-medium uppercase tracking-wider px-2 py-1 rounded-full ${impact?.className ?? "bg-surface-muted text-foreground-muted"}`}
                    >
                      {impact?.label ?? event.impact}
                    </span>
                  </div>
                );
              })}
            </div>
            <a
              href="/content"
              className="mt-4 flex items-center justify-between px-4 py-3 rounded-2xl border border-dashed border-border hover:border-accent hover:bg-accent-soft/40 transition-colors group"
            >
              <span className="text-xs text-foreground-muted group-hover:text-accent">
                Planifier une campagne
              </span>
              <ArrowUpRight className="w-4 h-4 text-foreground-subtle group-hover:text-accent" />
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
