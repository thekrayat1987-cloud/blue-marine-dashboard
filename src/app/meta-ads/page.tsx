"use client";

import {
  DollarSign,
  MousePointerClick,
  Eye,
  Target,
  ShoppingCart,
  TrendingUp,
  RefreshCw,
  Loader2,
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

const adBudgetData = budgetAllocation.filter((b) =>
  b.category.includes("Meta") || b.category.includes("Google") || b.category.includes("TikTok")
);

const PIE_COLORS = ["#1877f2", "#ea4335", "#000000"];

export default function MetaAdsPage() {
  const { data, loading, error, refresh } = useMetaData();

  const insights = data?.insights;
  const campaigns = data?.campaigns && data.campaigns.length > 0 ? data.campaigns : staticCampaigns;

  return (
    <div className="flex-1 overflow-auto">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-background/80 backdrop-blur-md px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Meta Ads</h1>
            <p className="text-sm text-slate-400 mt-0.5">Ad campaign management</p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-300 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </button>
        </div>
        {error && (
          <div className="mt-2 text-xs text-orange-400 bg-orange-500/10 px-3 py-1.5 rounded-lg">
            Meta API error — showing target data. {error}
          </div>
        )}
      </header>

      <div className="p-8 space-y-8">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KPICard label="Spend" value={`$${(insights?.totalSpend ?? 0).toLocaleString()}`} subtitle={`Budget: $${metaAdsTargets.monthlyBudget}/month`} icon={DollarSign} color="text-green-400" />
          <KPICard label="ROAS" value={`${insights?.roas ?? 0}x`} subtitle={`Target: ${metaAdsTargets.targetROAS}x`} icon={TrendingUp} color="text-accent" />
          <KPICard label="CPC" value={`$${insights?.avgCPC ?? metaAdsTargets.targetCPC}`} subtitle={`Target: $${metaAdsTargets.targetCPC}`} icon={MousePointerClick} color="text-blue-400" />
          <KPICard label="CPM" value={`$${insights?.avgCPM ?? metaAdsTargets.targetCPM}`} subtitle={`Target: $${metaAdsTargets.targetCPM}`} icon={Eye} color="text-purple-400" />
          <KPICard label="CTR" value={`${insights?.avgCTR ?? metaAdsTargets.targetCTR}%`} subtitle={`Target: ${metaAdsTargets.targetCTR}%`} icon={Target} color="text-orange-400" />
          <KPICard label="Conversions" value={(insights?.totalConversions ?? 0).toLocaleString()} subtitle={`Revenue: $${(insights?.totalRevenue ?? 0).toLocaleString()}`} icon={ShoppingCart} color="text-emerald-400" />
        </div>

        {/* Campaigns Table + Pie */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-xl bg-card border border-white/5 overflow-hidden">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Campaigns</h2>
              {data?.campaigns && <span className="text-[10px] text-green-400 bg-green-500/15 px-2 py-0.5 rounded-full">LIVE</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-white/5">
                    <th className="px-6 py-3 font-medium">Campaign</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Objective</th>
                    <th className="px-4 py-3 font-medium text-right">Budget</th>
                    <th className="px-4 py-3 font-medium text-right">Spend</th>
                    <th className="px-4 py-3 font-medium text-right">Impressions</th>
                    <th className="px-4 py-3 font-medium text-right">Clics</th>
                    <th className="px-4 py-3 font-medium text-right">Conv.</th>
                    <th className="px-6 py-3 font-medium text-right">Revenue</th>
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
                        : "bg-slate-500/20 text-slate-400";
                    return (
                      <tr key={c.name} className="border-b border-white/5 hover:bg-white/[.02] transition-colors">
                        <td className="px-6 py-3.5 font-medium text-white">{c.name}</td>
                        <td className="px-4 py-3.5">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${statusColor}`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-400">{c.objective}</td>
                        <td className="px-4 py-3.5 text-right text-white">${budget.toLocaleString()}</td>
                        <td className="px-4 py-3.5 text-right text-slate-400">${(ins?.spend ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3.5 text-right text-slate-400">{(ins?.impressions ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3.5 text-right text-slate-400">{(ins?.clicks ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3.5 text-right text-slate-400">{ins?.conversions ?? 0}</td>
                        <td className="px-6 py-3.5 text-right text-white">${(ins?.revenue ?? 0).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl bg-card border border-white/5 p-6">
            <h2 className="text-sm font-semibold text-white mb-4">Ads Budget Breakdown</h2>
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
                    <span className="text-slate-300">{b.category}</span>
                  </div>
                  <span className="text-white font-medium">{b.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
