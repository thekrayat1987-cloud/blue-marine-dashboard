"use client";

import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Target,
  Percent,
  BarChart3,
  CalendarDays,
  RefreshCw,
  Loader2,
  Users,
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
import {
  ANNUAL_TARGET,
  ORDERS_PER_MONTH,
  monthlyData as staticMonthlyData,
  channelData,
  kpiDefinitions,
  seasonalEvents,
} from "@/data/dashboardData";

export default function Home() {
  const { data, loading, error, refresh } = useDashboardData();

  // Merge real Shopify data with static targets
  const monthlyData = staticMonthlyData.map((m) => {
    const real = data?.shopify?.monthlyBreakdown.find((r) => r.month === m.month);
    return { ...m, revenue: real?.revenue ?? m.revenue, orders: real?.orders ?? m.orders };
  });

  const totalRevenue = data?.shopify?.totalRevenue ?? monthlyData.reduce((s, m) => s + m.revenue, 0);
  const totalOrders = data?.shopify?.totalOrders ?? monthlyData.reduce((s, m) => s + m.orders, 0);
  const aov = data?.shopify?.averageOrderValue ?? (totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 200);
  const totalAdSpend = data?.meta?.accountInsights?.totalSpend ?? monthlyData.reduce((s, m) => s + m.adSpend, 0);
  const roas = totalAdSpend > 0 ? (totalRevenue / totalAdSpend).toFixed(1) : "0.0";
  const followers = data?.instagram?.profile?.followers ?? 0;

  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-white/10 bg-background/80 backdrop-blur-md px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Overview</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Marketing Dashboard &mdash; {new Date().getFullYear()} Goal
            </p>
          </div>
          <div className="flex items-center gap-3">
            {data?.lastUpdated && (
              <span className="text-[10px] text-slate-500">
                MAJ: {new Date(data.lastUpdated).toLocaleTimeString("fr-FR")}
              </span>
            )}
            <button
              onClick={refresh}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-300 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh
            </button>
          </div>
        </div>
        {error && (
          <div className="mt-2 text-xs text-orange-400 bg-orange-500/10 px-3 py-1.5 rounded-lg">
            API connection error — showing static data. {error}
          </div>
        )}
        {data?.errors && data.errors.length > 0 && (
          <div className="mt-2 text-xs text-orange-400 bg-orange-500/10 px-3 py-1.5 rounded-lg">
            Some APIs did not respond: {data.errors.join(", ")}
          </div>
        )}
      </header>

      <div className="p-8 space-y-8">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KPICard
            label="Revenue"
            value={`$${totalRevenue.toLocaleString()}`}
            subtitle={`Goal: $${ANNUAL_TARGET.toLocaleString()}`}
            icon={DollarSign}
            color="text-green-400"
          />
          <KPICard
            label="Orders"
            value={totalOrders.toLocaleString()}
            subtitle={`Target: ${ORDERS_PER_MONTH}/month`}
            icon={ShoppingCart}
            color="text-blue-400"
          />
          <KPICard
            label="Avg Order"
            value={`$${aov}`}
            subtitle={`Target: $${kpiDefinitions.AOV.target}`}
            icon={TrendingUp}
            color="text-accent"
          />
          <KPICard
            label="ROAS"
            value={`${roas}x`}
            subtitle={`Target: ${kpiDefinitions.ROAS.target}x`}
            icon={Target}
            color="text-purple-400"
          />
          <KPICard
            label="Followers IG"
            value={followers.toLocaleString()}
            subtitle="Instagram"
            icon={Users}
            color="text-pink-400"
          />
          <KPICard
            label="Margin"
            value={`${kpiDefinitions.marginRate.target}%`}
            subtitle="Gross margin target"
            icon={BarChart3}
            color="text-emerald-400"
          />
        </div>

        {/* Revenue Chart */}
        <div className="rounded-xl bg-card border border-white/5 p-6">
          <h2 className="text-sm font-semibold text-white mb-1">Monthly Revenue vs Target</h2>
          <p className="text-xs text-slate-500 mb-6">Annual progression — $1M Goal</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#e2e8f0", fontSize: 13 }}
                  formatter={(value) => [`$${Number(value).toLocaleString()}`, undefined]}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
                <Bar dataKey="target" name="Target" fill="#c8a96e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Channels + Seasonal Events */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-sm font-semibold text-white">Sales Channels</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {channelData.map((channel) => {
                let currentRevenue = 0;
                if (channel.name.includes("Instagram") && data?.meta?.accountInsights) {
                  currentRevenue = data.meta.accountInsights.totalRevenue * 0.4;
                } else if (channel.name.includes("Shopify") && data?.shopify) {
                  currentRevenue = data.shopify.totalRevenue * 0.35;
                }
                return (
                  <div key={channel.name} className="rounded-xl bg-card border border-white/5 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: channel.color }} />
                      <span className="text-sm font-medium text-white">{channel.name}</span>
                    </div>
                    <p className="text-2xl font-bold text-white">{channel.percentage}%</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Target: ${channel.targetRevenue.toLocaleString()}
                    </p>
                    <div className="mt-3">
                      <ProgressBar value={currentRevenue} max={channel.targetRevenue} color="bg-accent" size="sm" />
                    </div>
                    {currentRevenue > 0 && (
                      <p className="text-[10px] text-accent mt-1">${Math.round(currentRevenue).toLocaleString()} earned</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-white mb-4">Seasonal Events</h2>
            <div className="rounded-xl bg-card border border-white/5 p-4 space-y-3">
              {seasonalEvents.map((event) => {
                const impactColor =
                  event.impact === "very-high"
                    ? "bg-red-500/20 text-red-400"
                    : event.impact === "high"
                    ? "bg-orange-500/20 text-orange-400"
                    : "bg-blue-500/20 text-blue-400";
                return (
                  <div key={event.name} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                    <div>
                      <div className="flex items-center gap-2">
                        <CalendarDays className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-sm font-medium text-white">{event.name}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 ml-5.5">{event.month}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${impactColor}`}>
                      {event.impact}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
