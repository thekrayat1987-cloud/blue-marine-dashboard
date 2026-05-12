import { usdToKd } from "./currency";

export class OAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthError";
  }
}

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN!;
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID!;
const META_API_VERSION = "v21.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

async function metaFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${META_BASE_URL}/${endpoint}`);
  url.searchParams.set("access_token", META_ACCESS_TOKEN);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    if (error?.error?.type === "OAuthException") {
      throw new OAuthError(`Meta token invalide ou expiré (code ${error.error.code})`);
    }
    throw new Error(`Meta API error: ${res.status} - ${JSON.stringify(error)}`);
  }
  return res.json();
}

export interface MetaCampaign {
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
}

export async function getCampaigns(): Promise<MetaCampaign[]> {
  const data = await metaFetch<{
    data: Array<{
      id: string;
      name: string;
      status: string;
      objective: string;
      daily_budget?: string;
      lifetime_budget?: string;
    }>;
  }>(`${META_AD_ACCOUNT_ID}/campaigns`, {
    fields: "id,name,status,objective,daily_budget,lifetime_budget",
    limit: "50",
  });

  const campaigns: MetaCampaign[] = [];

  for (const campaign of data.data) {
    let insights;
    try {
      const insightsData = await metaFetch<{
        data: Array<{
          spend: string;
          impressions: string;
          clicks: string;
          actions?: Array<{ action_type: string; value: string }>;
          action_values?: Array<{ action_type: string; value: string }>;
          cpc: string;
          cpm: string;
          ctr: string;
        }>;
      }>(`${campaign.id}/insights`, {
        fields: "spend,impressions,clicks,actions,action_values,cpc,cpm,ctr",
        date_preset: "this_year",
      });

      if (insightsData.data.length > 0) {
        const d = insightsData.data[0];
        const conversions = d.actions?.find((a) => a.action_type === "purchase")?.value || "0";
        const revenue = d.action_values?.find((a) => a.action_type === "purchase")?.value || "0";
        const spend = parseFloat(d.spend);

        insights = {
          spend: Math.round(usdToKd(spend)),
          impressions: parseInt(d.impressions),
          clicks: parseInt(d.clicks),
          conversions: parseInt(conversions),
          revenue: Math.round(usdToKd(parseFloat(revenue))),
          cpc: parseFloat(usdToKd(parseFloat(d.cpc)).toFixed(2)),
          cpm: parseFloat(usdToKd(parseFloat(d.cpm)).toFixed(2)),
          ctr: parseFloat(parseFloat(d.ctr).toFixed(2)),
          roas: spend > 0 ? parseFloat((parseFloat(revenue) / spend).toFixed(1)) : 0,
        };
      }
    } catch {
      // Campaign may not have insights yet
    }

    campaigns.push({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status.toLowerCase(),
      objective: campaign.objective?.replace("OUTCOME_", "").replace(/_/g, " ") || "Unknown",
      dailyBudget: campaign.daily_budget ? usdToKd(parseFloat(campaign.daily_budget) / 100) : 0,
      lifetimeBudget: campaign.lifetime_budget ? usdToKd(parseFloat(campaign.lifetime_budget) / 100) : 0,
      insights,
    });
  }

  return campaigns;
}

export interface MetaAdAccountInsights {
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  totalRevenue: number;
  avgCPC: number;
  avgCPM: number;
  avgCTR: number;
  roas: number;
}

export async function getAdAccountInsights(
  datePreset: string = "this_year",
): Promise<MetaAdAccountInsights> {
  const data = await metaFetch<{
    data: Array<{
      spend: string;
      impressions: string;
      clicks: string;
      cpc: string;
      cpm: string;
      ctr: string;
      actions?: Array<{ action_type: string; value: string }>;
      action_values?: Array<{ action_type: string; value: string }>;
    }>;
  }>(`${META_AD_ACCOUNT_ID}/insights`, {
    fields: "spend,impressions,clicks,cpc,cpm,ctr,actions,action_values",
    date_preset: datePreset,
  });

  if (!data.data.length) {
    return { totalSpend: 0, totalImpressions: 0, totalClicks: 0, totalConversions: 0, totalRevenue: 0, avgCPC: 0, avgCPM: 0, avgCTR: 0, roas: 0 };
  }

  const d = data.data[0];
  const spend = parseFloat(d.spend);
  const conversions = parseInt(d.actions?.find((a) => a.action_type === "purchase")?.value || "0");
  const revenue = parseFloat(d.action_values?.find((a) => a.action_type === "purchase")?.value || "0");

  return {
    totalSpend: Math.round(usdToKd(spend)),
    totalImpressions: parseInt(d.impressions),
    totalClicks: parseInt(d.clicks),
    totalConversions: conversions,
    totalRevenue: Math.round(usdToKd(revenue)),
    avgCPC: parseFloat(usdToKd(parseFloat(d.cpc)).toFixed(2)),
    avgCPM: parseFloat(usdToKd(parseFloat(d.cpm)).toFixed(2)),
    avgCTR: parseFloat(parseFloat(d.ctr).toFixed(2)),
    roas: spend > 0 ? parseFloat((revenue / spend).toFixed(1)) : 0,
  };
}
