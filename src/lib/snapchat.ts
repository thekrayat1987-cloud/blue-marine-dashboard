import { usdToKd } from "./currency";

const SNAP_ACCESS_TOKEN = process.env.SNAP_ACCESS_TOKEN!;
const SNAP_AD_ACCOUNT_ID = process.env.SNAP_AD_ACCOUNT_ID!;
const SNAP_BASE_URL = "https://adsapi.snapchat.com/v1";

async function snapFetch<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${SNAP_BASE_URL}/${endpoint}`, {
    headers: {
      Authorization: `Bearer ${SNAP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(`Snapchat API error: ${res.status} - ${JSON.stringify(error)}`);
  }
  return res.json();
}

export interface SnapCampaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  dailyBudget: number;
  lifetimeBudget: number;
  startTime: string;
}

export async function getCampaigns(): Promise<SnapCampaign[]> {
  const data = await snapFetch<{
    campaigns: Array<{
      campaign: {
        id: string;
        name: string;
        status: string;
        objective: string;
        daily_budget_micro: number;
        lifetime_spend_cap_micro: number;
        start_time: string;
      };
    }>;
  }>(`adaccounts/${SNAP_AD_ACCOUNT_ID}/campaigns`);

  return (data.campaigns || []).map((c) => ({
    id: c.campaign.id,
    name: c.campaign.name,
    status: c.campaign.status,
    objective: c.campaign.objective || "Unknown",
    dailyBudget: usdToKd((c.campaign.daily_budget_micro || 0) / 1000000),
    lifetimeBudget: usdToKd((c.campaign.lifetime_spend_cap_micro || 0) / 1000000),
    startTime: c.campaign.start_time,
  }));
}

export interface SnapAccountStats {
  spend: number;
  impressions: number;
  swipes: number;
}

export async function getAccountStats(): Promise<SnapAccountStats> {
  try {
    const data = await snapFetch<{
      total_stats: Array<{
        total_stat: {
          stats: {
            spend: number;
            impressions: number;
            swipes: number;
          };
        };
      }>;
    }>(`adaccounts/${SNAP_AD_ACCOUNT_ID}/stats?granularity=LIFETIME&fields=spend,impressions,swipes`);

    if (data.total_stats?.length) {
      const stats = data.total_stats[0].total_stat.stats;
      return {
        spend: usdToKd((stats.spend || 0) / 1000000),
        impressions: stats.impressions || 0,
        swipes: stats.swipes || 0,
      };
    }
    return { spend: 0, impressions: 0, swipes: 0 };
  } catch {
    return { spend: 0, impressions: 0, swipes: 0 };
  }
}
