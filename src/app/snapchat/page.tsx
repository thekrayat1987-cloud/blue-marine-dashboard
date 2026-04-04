"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Ghost,
  DollarSign,
  Eye,
  MousePointerClick,
  RefreshCw,
  Loader2,
  ExternalLink,
} from "lucide-react";
import KPICard from "@/components/KPICard";

interface SnapData {
  campaigns?: Array<{
    id: string;
    name: string;
    status: string;
    objective: string;
    dailyBudget: number;
    lifetimeBudget: number;
  }>;
  stats?: {
    spend: number;
    impressions: number;
    swipes: number;
  } | null;
  error?: string;
  needsAuth?: boolean;
}

export default function SnapchatPage() {
  const [data, setData] = useState<SnapData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/snapchat");
      const json = await res.json();
      setData(json);
    } catch {
      setData({ error: "Failed to load" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const needsAuth = data?.needsAuth;
  const campaigns = data?.campaigns || [];
  const stats = data?.stats;

  return (
    <div className="flex-1 overflow-auto">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-background/80 backdrop-blur-md px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Snapchat Ads</h1>
            <p className="text-sm text-slate-400 mt-0.5">Campaign performance & analytics</p>
          </div>
          <button onClick={fetchData} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-300 transition-colors disabled:opacity-50">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </button>
        </div>
      </header>

      <div className="p-8 space-y-8">
        {needsAuth ? (
          <div className="rounded-xl bg-card border border-white/5 p-8 text-center">
            <Ghost className="w-12 h-12 text-[#FFFC00] mx-auto mb-4" />
            <h2 className="text-lg font-bold text-white mb-2">Connect Snapchat Ads</h2>
            <p className="text-sm text-slate-400 mb-6">Authorize access to view your Snapchat campaign data</p>
            <a href="/api/auth/snapchat"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#FFFC00] text-black text-sm font-semibold hover:bg-[#e6e300] transition-colors">
              <ExternalLink className="w-4 h-4" />
              Connect Snapchat
            </a>
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <KPICard label="Spend" value={`$${(stats?.spend ?? 0).toLocaleString()}`} subtitle="Total ad spend" icon={DollarSign} color="text-[#FFFC00]" />
              <KPICard label="Impressions" value={(stats?.impressions ?? 0).toLocaleString()} subtitle="Total impressions" icon={Eye} color="text-blue-400" />
              <KPICard label="Swipe Ups" value={(stats?.swipes ?? 0).toLocaleString()} subtitle="Total swipe ups" icon={MousePointerClick} color="text-purple-400" />
            </div>

            {/* Campaigns Table */}
            <div className="rounded-xl bg-card border border-white/5 overflow-hidden">
              <div className="px-6 py-4 border-b border-white/5 flex items-center gap-2">
                <Ghost className="w-4 h-4 text-[#FFFC00]" />
                <h2 className="text-sm font-semibold text-white">Campaigns</h2>
                <span className="text-xs text-slate-500 ml-auto">{campaigns.length} campaigns</span>
              </div>
              {campaigns.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-white/5">
                      <th className="px-6 py-3 font-medium">Campaign</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Objective</th>
                      <th className="px-4 py-3 font-medium text-right">Daily Budget</th>
                      <th className="px-6 py-3 font-medium text-right">Lifetime Budget</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => {
                      const statusColor = c.status === "ACTIVE" ? "bg-green-500/20 text-green-400" :
                        c.status === "PAUSED" ? "bg-yellow-500/20 text-yellow-400" : "bg-slate-500/20 text-slate-400";
                      return (
                        <tr key={c.id} className="border-b border-white/5 hover:bg-white/[.02] transition-colors">
                          <td className="px-6 py-3.5 font-medium text-white">{c.name}</td>
                          <td className="px-4 py-3.5">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${statusColor}`}>{c.status}</span>
                          </td>
                          <td className="px-4 py-3.5 text-slate-400">{c.objective}</td>
                          <td className="px-4 py-3.5 text-right text-white">${c.dailyBudget.toLocaleString()}</td>
                          <td className="px-6 py-3.5 text-right text-white">${c.lifetimeBudget.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="px-6 py-8 text-center text-sm text-slate-500">
                  No campaigns yet. Create your first Snapchat campaign to see data here.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
