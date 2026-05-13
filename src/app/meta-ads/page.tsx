"use client";

import { useEffect, useState } from "react";
import {
  DollarSign,
  MousePointerClick,
  Eye,
  Target,
  ShoppingCart,
  TrendingUp,
  RefreshCw,
  Loader2,
  Scissors,
  Rocket,
  Eye as EyeIcon,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import KPICard from "@/components/KPICard";
import { useMetaData } from "@/hooks/useDashboardData";
import { metaAdsTargets, metaCampaigns as staticCampaigns, budgetAllocation } from "@/data/dashboardData";

type AuditVerdict = "scale" | "cut" | "watch" | "inactive" | "no_data";
interface AuditRow {
  id: string;
  name: string;
  status: string;
  verdict: AuditVerdict;
  spend: number;
  revenue: number;
  conversions: number;
  roas: number;
  cpa: number;
  ctr: number;
  reason: string;
  action: string;
  potentialMonthlySavings?: number;
  recommendedBudgetIncrease?: number;
}
interface AuditTotals {
  toCut: number;
  toScale: number;
  toWatch: number;
  noData: number;
  wastedSpend: number;
  monthlySavings: number;
  recommendedAddBudget: number;
}

const adBudgetData = budgetAllocation.filter((b) =>
  b.category.includes("Meta") || b.category.includes("Google") || b.category.includes("TikTok")
);

const PIE_COLORS = ["#1877f2", "#ea4335", "#000000"];

export default function MetaAdsPage() {
  const { data, loading, error, refresh } = useMetaData();
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditTotals, setAuditTotals] = useState<AuditTotals | null>(null);
  const [auditLoading, setAuditLoading] = useState(true);

  useEffect(() => {
    fetch("/api/meta/audit")
      .then((r) => r.json())
      .then((json) => {
        setAudit(json.audit ?? []);
        setAuditTotals(json.totals ?? null);
      })
      .catch(() => {})
      .finally(() => setAuditLoading(false));
  }, []);

  const insights = data?.insights;
  const campaigns = data?.campaigns && data.campaigns.length > 0 ? data.campaigns : staticCampaigns;

  const cutRows = audit.filter((a) => a.verdict === "cut");
  const scaleRows = audit.filter((a) => a.verdict === "scale");
  const watchRows = audit.filter((a) => a.verdict === "watch");
  const noDataRows = audit.filter((a) => a.verdict === "no_data");

  return (
    <div className="flex-1 overflow-auto">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Meta Ads</h1>
            <p className="text-sm text-foreground-muted mt-0.5">Gestion des campagnes publicitaires</p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-muted hover:bg-surface-muted text-xs text-foreground-muted transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Actualiser
          </button>
        </div>
        {error && (
          <div className="mt-2 text-xs text-orange-400 bg-orange-500/10 px-3 py-1.5 rounded-lg">
            Erreur API Meta — affichage des données cibles. {error}
          </div>
        )}
      </header>

      <div className="p-8 space-y-8">
        {/* Audit recommendations */}
        <div className="rounded-2xl bg-gradient-to-br from-accent-soft to-surface border border-accent/20 overflow-hidden">
          <div className="px-6 py-4 border-b border-accent/15 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">Audit campagnes — 30 derniers jours</h2>
            <span className="text-[10px] text-foreground-subtle ml-auto">Recommandations basées sur ROAS, dépense et conversions</span>
          </div>
          {auditLoading ? (
            <div className="px-6 py-8 flex items-center justify-center text-sm text-foreground-subtle">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Chargement de l&apos;audit…
            </div>
          ) : audit.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-foreground-subtle">
              Aucune donnée Meta disponible — vérifie ta connexion Meta API dans /settings.
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border-b border-accent/15">
                <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                  <div className="flex items-center gap-1.5 text-red-600 text-[10px] uppercase tracking-wider font-semibold">
                    <Scissors className="w-3 h-3" /> À couper
                  </div>
                  <p className="text-2xl font-bold text-foreground mt-1 tabular-nums">{auditTotals?.toCut ?? 0}</p>
                  {auditTotals && auditTotals.monthlySavings > 0 && (
                    <p className="text-[10px] text-red-600 mt-0.5">~{auditTotals.monthlySavings} KD/mois économisés</p>
                  )}
                </div>
                <div className="px-3 py-2.5 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-1.5 text-green-600 text-[10px] uppercase tracking-wider font-semibold">
                    <Rocket className="w-3 h-3" /> À scaler
                  </div>
                  <p className="text-2xl font-bold text-foreground mt-1 tabular-nums">{auditTotals?.toScale ?? 0}</p>
                  {auditTotals && auditTotals.recommendedAddBudget > 0 && (
                    <p className="text-[10px] text-green-600 mt-0.5">+{auditTotals.recommendedAddBudget} KD/jour suggérés</p>
                  )}
                </div>
                <div className="px-3 py-2.5 rounded-lg bg-accent-soft border border-accent/30">
                  <div className="flex items-center gap-1.5 text-accent text-[10px] uppercase tracking-wider font-semibold">
                    <EyeIcon className="w-3 h-3" /> À surveiller
                  </div>
                  <p className="text-2xl font-bold text-foreground mt-1 tabular-nums">{auditTotals?.toWatch ?? 0}</p>
                  <p className="text-[10px] text-foreground-subtle mt-0.5">ROAS entre 2x et 4x</p>
                </div>
                <div className="px-3 py-2.5 rounded-lg bg-surface-muted border border-border">
                  <div className="flex items-center gap-1.5 text-foreground-muted text-[10px] uppercase tracking-wider font-semibold">
                    <AlertCircle className="w-3 h-3" /> Données insuffisantes
                  </div>
                  <p className="text-2xl font-bold text-foreground mt-1 tabular-nums">{auditTotals?.noData ?? 0}</p>
                  <p className="text-[10px] text-foreground-subtle mt-0.5">&lt; 20 KD dépensés</p>
                </div>
              </div>

              {/* Action lists */}
              <div className="p-4 space-y-4">
                {cutRows.length > 0 && (
                  <AuditGroup
                    title="🔴 À couper maintenant"
                    rows={cutRows}
                    accentClass="border-red-500/30 bg-red-500/5"
                    badgeClass="bg-red-500/15 text-red-600"
                  />
                )}
                {scaleRows.length > 0 && (
                  <AuditGroup
                    title="🟢 À scaler cette semaine"
                    rows={scaleRows}
                    accentClass="border-green-500/30 bg-green-500/5"
                    badgeClass="bg-green-500/15 text-green-600"
                  />
                )}
                {watchRows.length > 0 && (
                  <AuditGroup
                    title="🟡 À optimiser (ROAS 2-4x)"
                    rows={watchRows}
                    accentClass="border-accent/30 bg-accent-soft"
                    badgeClass="bg-accent-soft text-accent"
                  />
                )}
                {noDataRows.length > 0 && (
                  <AuditGroup
                    title="⚪ Données insuffisantes — patience"
                    rows={noDataRows}
                    accentClass="border-border bg-surface-muted/30"
                    badgeClass="bg-surface-muted text-foreground-muted"
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KPICard label="Dépenses" value={`${(insights?.totalSpend ?? 0).toLocaleString()} KD`} subtitle={`Budget : ${metaAdsTargets.monthlyBudget} KD/mois`} icon={DollarSign} color="text-green-400" />
          <KPICard label="ROAS" value={`${insights?.roas ?? 0}x`} subtitle={`Cible : ${metaAdsTargets.targetROAS}x`} icon={TrendingUp} color="text-accent" />
          <KPICard label="CPC" value={`${insights?.avgCPC ?? metaAdsTargets.targetCPC} KD`} subtitle={`Cible : ${metaAdsTargets.targetCPC} KD`} icon={MousePointerClick} color="text-blue-400" />
          <KPICard label="CPM" value={`${insights?.avgCPM ?? metaAdsTargets.targetCPM} KD`} subtitle={`Cible : ${metaAdsTargets.targetCPM} KD`} icon={Eye} color="text-purple-400" />
          <KPICard label="CTR" value={`${insights?.avgCTR ?? metaAdsTargets.targetCTR}%`} subtitle={`Cible : ${metaAdsTargets.targetCTR}%`} icon={Target} color="text-orange-400" />
          <KPICard label="Conversions" value={(insights?.totalConversions ?? 0).toLocaleString()} subtitle={`Revenu : ${(insights?.totalRevenue ?? 0).toLocaleString()} KD`} icon={ShoppingCart} color="text-emerald-400" />
        </div>

        {/* Campaigns Table + Pie */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-xl bg-surface border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Campagnes</h2>
              {data?.campaigns && <span className="text-[10px] text-green-400 bg-green-500/15 px-2 py-0.5 rounded-full">LIVE</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-foreground-subtle border-b border-border">
                    <th className="px-6 py-3 font-medium">Campagne</th>
                    <th className="px-4 py-3 font-medium">Statut</th>
                    <th className="px-4 py-3 font-medium">Objectif</th>
                    <th className="px-4 py-3 font-medium text-right">Budget</th>
                    <th className="px-4 py-3 font-medium text-right">Dépenses</th>
                    <th className="px-4 py-3 font-medium text-right">Impressions</th>
                    <th className="px-4 py-3 font-medium text-right">Clics</th>
                    <th className="px-4 py-3 font-medium text-right">Conv.</th>
                    <th className="px-6 py-3 font-medium text-right">Revenu</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => {
                    const isLive = "id" in c;
                    const budget = isLive ? (c as { dailyBudget: number; lifetimeBudget: number }).dailyBudget || (c as { lifetimeBudget: number }).lifetimeBudget : (c as { budget: number }).budget;
                    const ins = isLive ? (c as { insights?: { spend: number; impressions: number; clicks: number; conversions: number; revenue: number } }).insights : undefined;

                    const statusColor =
                      c.status === "active" || c.status === "ACTIVE"
                        ? "bg-green-500/20 text-green-400"
                        : c.status === "paused" || c.status === "PAUSED"
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-surface-muted text-foreground-muted";
                    return (
                      <tr key={c.name} className="border-b border-border hover:bg-surface-muted transition-colors">
                        <td className="px-6 py-3.5 font-medium text-foreground">{c.name}</td>
                        <td className="px-4 py-3.5">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${statusColor}`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-foreground-muted">{c.objective}</td>
                        <td className="px-4 py-3.5 text-right text-foreground">{budget.toLocaleString()} KD</td>
                        <td className="px-4 py-3.5 text-right text-foreground-muted">{(ins?.spend ?? 0).toLocaleString()} KD</td>
                        <td className="px-4 py-3.5 text-right text-foreground-muted">{(ins?.impressions ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3.5 text-right text-foreground-muted">{(ins?.clicks ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3.5 text-right text-foreground-muted">{ins?.conversions ?? 0}</td>
                        <td className="px-6 py-3.5 text-right text-foreground">{(ins?.revenue ?? 0).toLocaleString()} KD</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl bg-surface border border-border p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Répartition du budget pubs</h2>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={adBudgetData}
                    dataKey="percentage"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {adBudgetData.map((entry, i) => (
                      <Cell key={entry.category} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#e2e8f0", fontSize: 13 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 mt-4">
              {adBudgetData.map((b, i) => (
                <div key={b.category} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-foreground-muted">{b.category}</span>
                  </div>
                  <span className="text-foreground font-medium">{b.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuditGroup({
  title,
  rows,
  accentClass,
  badgeClass,
}: {
  title: string;
  rows: AuditRow[];
  accentClass: string;
  badgeClass: string;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">{title}</h3>
      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.id}
            className={`rounded-lg border ${accentClass} px-4 py-3 flex items-start gap-3 flex-wrap`}
          >
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-foreground">{r.name}</p>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>
                  ROAS {r.roas.toFixed(1)}x
                </span>
                <span className="text-[10px] text-foreground-subtle">
                  {r.spend} KD dépensés · {r.conversions} conv · {r.revenue} KD revenu
                </span>
              </div>
              <p className="text-xs text-foreground-muted mt-1.5">{r.reason}</p>
              <p className="text-xs text-foreground mt-1.5 font-medium">→ {r.action}</p>
            </div>
            <a
              href={`https://business.facebook.com/adsmanager/manage/campaigns?selected_campaign_ids=${r.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-[11px] text-accent hover:underline whitespace-nowrap self-center"
            >
              Ouvrir dans Meta →
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
