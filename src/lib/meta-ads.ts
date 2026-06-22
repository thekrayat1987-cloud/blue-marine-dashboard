import { usdToKd } from "./currency";
import { getIntegrationAccessToken } from "@/lib/integration-tokens";

export class OAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthError";
  }
}

const META_API_VERSION = "v21.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

async function getMetaConfig(): Promise<{ token: string; adAccountId: string }> {
  const token = await getIntegrationAccessToken("meta", "META_ACCESS_TOKEN");
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!token) throw new Error("META_ACCESS_TOKEN manquant");
  if (!adAccountId) throw new Error("META_AD_ACCOUNT_ID manquant");
  return { token, adAccountId };
}

async function metaFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const { token } = await getMetaConfig();
  const url = new URL(`${META_BASE_URL}/${endpoint}`);
  url.searchParams.set("access_token", token);
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

export async function getCampaigns(datePreset: string = "this_year"): Promise<MetaCampaign[]> {
  const { adAccountId } = await getMetaConfig();
  const data = await metaFetch<{
    data: Array<{
      id: string;
      name: string;
      status: string;
      objective: string;
      daily_budget?: string;
      lifetime_budget?: string;
    }>;
  }>(`${adAccountId}/campaigns`, {
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
        date_preset: datePreset,
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

export type CampaignAuditVerdict = "scale" | "cut" | "watch" | "inactive" | "no_data";

export interface CampaignAuditRow {
  id: string;
  name: string;
  status: string;
  verdict: CampaignAuditVerdict;
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

const MIN_SPEND_FOR_VERDICT = 20; // KD — below this, "no_data"
const ROAS_CUT_THRESHOLD = 2.0;
const ROAS_SCALE_THRESHOLD = 4.0;

export function classifyCampaign(c: MetaCampaign): CampaignAuditRow {
  const isActive = c.status === "active";
  const spend = c.insights?.spend ?? 0;
  const revenue = c.insights?.revenue ?? 0;
  const conversions = c.insights?.conversions ?? 0;
  const roas = c.insights?.roas ?? 0;
  const ctr = c.insights?.ctr ?? 0;
  const cpa = conversions > 0 ? spend / conversions : 0;

  let verdict: CampaignAuditVerdict;
  let reason: string;
  let action: string;
  let potentialMonthlySavings: number | undefined;
  let recommendedBudgetIncrease: number | undefined;

  if (!isActive) {
    verdict = "inactive";
    reason = `Campagne ${c.status}`;
    action = "Aucune action — campagne déjà arrêtée";
  } else if (spend < MIN_SPEND_FOR_VERDICT) {
    verdict = "no_data";
    reason = `Dépense ${spend} KD insuffisante pour décider (seuil ${MIN_SPEND_FOR_VERDICT} KD)`;
    action = "Surveille — attends ≥ 20 KD dépensés pour évaluer";
  } else if (roas < ROAS_CUT_THRESHOLD) {
    verdict = "cut";
    const dailyBudget = c.dailyBudget;
    if (dailyBudget > 0) {
      potentialMonthlySavings = Math.round(dailyBudget * 30);
    }
    reason = `ROAS ${roas.toFixed(1)}x — chaque KD dépensé ne rapporte que ${roas.toFixed(1)} KD`;
    action = potentialMonthlySavings
      ? `Mets en pause cette campagne — économie ~${potentialMonthlySavings} KD/mois à réallouer ailleurs`
      : "Mets en pause cette campagne — elle perd de l'argent";
  } else if (roas >= ROAS_SCALE_THRESHOLD) {
    verdict = "scale";
    const dailyBudget = c.dailyBudget;
    if (dailyBudget > 0) {
      recommendedBudgetIncrease = Math.round(dailyBudget * 0.3);
    }
    reason = `ROAS ${roas.toFixed(1)}x — au-dessus de la cible 4x, scalable`;
    action = recommendedBudgetIncrease
      ? `Augmente le budget de +${recommendedBudgetIncrease} KD/jour (+30%). Re-vérifie après 14 jours`
      : "Augmente le budget de +30%. Re-vérifie après 14 jours";
  } else {
    verdict = "watch";
    reason = `ROAS ${roas.toFixed(1)}x — entre 2x et 4x, à optimiser`;
    action = "Garde tel quel mais teste de nouvelles créatives ou audiences pour pousser au-dessus de 4x";
  }

  return {
    id: c.id,
    name: c.name,
    status: c.status,
    verdict,
    spend,
    revenue,
    conversions,
    roas,
    cpa: Math.round(cpa * 100) / 100,
    ctr,
    reason,
    action,
    potentialMonthlySavings,
    recommendedBudgetIncrease,
  };
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
  const { adAccountId } = await getMetaConfig();
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
  }>(`${adAccountId}/insights`, {
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
