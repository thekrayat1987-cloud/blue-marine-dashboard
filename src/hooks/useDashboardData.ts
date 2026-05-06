"use client";

import { useState, useEffect, useCallback } from "react";

interface DashboardData {
  shopify: {
    totalRevenue: number;
    totalOrders: number;
    averageOrderValue: number;
    monthlyBreakdown: Array<{ month: string; revenue: number; orders: number }>;
  } | null;
  meta: {
    campaigns: Array<{
      id: string;
      name: string;
      status: string;
      objective: string;
      dailyBudget: number;
      lifetimeBudget: number;
      insights?: {
        spend: number;
        impressions: number;
        clicks: number;
        conversions: number;
        revenue: number;
        cpc: number;
        cpm: number;
        ctr: number;
        roas: number;
      };
    }>;
    accountInsights: {
      totalSpend: number;
      totalImpressions: number;
      totalClicks: number;
      totalConversions: number;
      totalRevenue: number;
      avgCPC: number;
      avgCPM: number;
      avgCTR: number;
      roas: number;
    } | null;
  };
  instagram: {
    profile: {
      followers: number;
      follows: number;
      mediaCount: number;
      name: string;
      username: string;
    } | null;
    insights: {
      impressions: number;
      reach: number;
      profileViews: number;
      websiteClicks: number;
      engagementRate: number;
    } | null;
  };
  errors?: string[];
  metaNeedsAuth?: boolean;
  lastUpdated: string;
}

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function useDashboardData() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { data, loading, error, refresh: fetchData };
}

export function useMetaData() {
  const [data, setData] = useState<{ campaigns: DashboardData["meta"]["campaigns"]; insights: DashboardData["meta"]["accountInsights"] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/meta");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur Meta API");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { data, loading, error, refresh: fetchData };
}
