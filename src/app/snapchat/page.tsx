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
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Snapchat Ads</h1>
            <p className="text-sm text-foreground-muted mt-0.5">Performance et analyses des campagnes</p>
          </div>
          <button onClick={fetchData} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-muted hover:bg-surface-muted text-xs text-foreground-muted transition-colors disabled:opacity-50">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Actualiser
          </button>
        </div>
      </header>

      <div className="p-8 space-y-8">
        {needsAuth ? (
          <div className="rounded-xl bg-surface border border-border p-8 text-center">
            <Ghost className="w-12 h-12 text-[#FFFC00] mx-auto mb-4" />
            <h2 className="text-lg font-bold text-foreground mb-2">Connecter Snapchat Ads</h2>
            <p className="text-sm text-foreground-muted mb-6">Autorise l&apos;accès pour voir les données de tes campagnes Snapchat</p>
            <a href="/api/auth/snapchat"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#FFFC00] text-black text-sm font-semibold hover:bg-[#e6e300] transition-colors">
              <ExternalLink className="w-4 h-4" />
              Connecter Snapchat
            </a>
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <KPICard label="Dépenses" value={`${(stats?.spend ?? 0).toLocaleString()} KD`} subtitle="Dépenses publicitaires" icon={DollarSign} color="text-[#FFFC00]" />
              <KPICard label="Impressions" value={(stats?.impressions ?? 0).toLocaleString()} subtitle="Total des impressions" icon={Eye} color="text-blue-400" />
              <KPICard label="Swipe Ups" value={(stats?.swipes ?? 0).toLocaleString()} subtitle="Total des swipe ups" icon={MousePointerClick} color="text-purple-400" />
            </div>

            {/* Campaigns Table */}
            <div className="rounded-xl bg-surface border border-border overflow-hidden">
              <div className="px-6 py-4 border-b border-border flex items-center gap-2">
                <Ghost className="w-4 h-4 text-[#FFFC00]" />
                <h2 className="text-sm font-semibold text-foreground">Campagnes</h2>
                <span className="text-xs text-foreground-subtle ml-auto">{campaigns.length} campagnes</span>
              </div>
              {campaigns.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-foreground-subtle border-b border-border">
                      <th className="px-6 py-3 font-medium">Campagne</th>
                      <th className="px-4 py-3 font-medium">Statut</th>
                      <th className="px-4 py-3 font-medium">Objectif</th>
                      <th className="px-4 py-3 font-medium text-right">Budget quotidien</th>
                      <th className="px-6 py-3 font-medium text-right">Budget total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => {
                      const statusColor = c.status === "ACTIVE" ? "bg-green-500/20 text-green-400" :
                        c.status === "PAUSED" ? "bg-yellow-500/20 text-yellow-400" : "bg-surface-muted text-foreground-muted";
                      return (
                        <tr key={c.id} className="border-b border-border hover:bg-surface-muted transition-colors">
                          <td className="px-6 py-3.5 font-medium text-foreground">{c.name}</td>
                          <td className="px-4 py-3.5">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${statusColor}`}>{c.status}</span>
                          </td>
                          <td className="px-4 py-3.5 text-foreground-muted">{c.objective}</td>
                          <td className="px-4 py-3.5 text-right text-foreground">{c.dailyBudget.toLocaleString()} KD</td>
                          <td className="px-6 py-3.5 text-right text-foreground">{c.lifetimeBudget.toLocaleString()} KD</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="px-6 py-8 text-center text-sm text-foreground-subtle">
                  Pas encore de campagnes. Crée ta première campagne Snapchat pour voir les données ici.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
