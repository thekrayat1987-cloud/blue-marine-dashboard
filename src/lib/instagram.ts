import { getIntegrationAccessToken } from "@/lib/integration-tokens";

const META_API_VERSION = "v21.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

async function getInstagramConfig(): Promise<{ token: string; instagramId: string }> {
  const token = await getIntegrationAccessToken("meta", "META_ACCESS_TOKEN");
  const instagramId = process.env.META_INSTAGRAM_ID;
  if (!token) throw new Error("META_ACCESS_TOKEN manquant");
  if (!instagramId) throw new Error("META_INSTAGRAM_ID manquant");
  return { token, instagramId };
}

async function igFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const { token } = await getInstagramConfig();
  const url = new URL(`${META_BASE_URL}/${endpoint}`);
  url.searchParams.set("access_token", token);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    if (error?.error?.type === "OAuthException") {
      const { OAuthError } = await import("./meta-ads");
      throw new OAuthError(`Meta/Instagram token invalide ou expiré (code ${error.error.code})`);
    }
    throw new Error(`Instagram API error: ${res.status} - ${JSON.stringify(error)}`);
  }
  return res.json();
}

export interface InstagramProfile {
  followers: number;
  follows: number;
  mediaCount: number;
  name: string;
  username: string;
}

export async function getProfile(): Promise<InstagramProfile> {
  const { instagramId } = await getInstagramConfig();
  const data = await igFetch<{
    followers_count: number;
    follows_count: number;
    media_count: number;
    name: string;
    username: string;
  }>(instagramId, {
    fields: "followers_count,follows_count,media_count,name,username",
  });

  return {
    followers: data.followers_count,
    follows: data.follows_count,
    mediaCount: data.media_count,
    name: data.name,
    username: data.username,
  };
}

export interface InstagramInsights {
  impressions: number;
  reach: number;
  profileViews: number;
  websiteClicks: number;
  engagementRate: number;
}

export async function getInsights(): Promise<InstagramInsights> {
  // Try to get insights, but gracefully handle permission errors
  try {
    const { instagramId } = await getInstagramConfig();
    const data = await igFetch<{
      data: Array<{
        name: string;
        values: Array<{ value: number }>;
      }>;
    }>(`${instagramId}/insights`, {
      metric: "impressions,reach,profile_views,website_clicks",
      period: "days_28",
    });

    const getValue = (name: string) => {
      const metric = data.data.find((m) => m.name === name);
      return metric?.values?.[0]?.value || 0;
    };

    const impressions = getValue("impressions");
    const reach = getValue("reach");

    return {
      impressions,
      reach,
      profileViews: getValue("profile_views"),
      websiteClicks: getValue("website_clicks"),
      engagementRate: reach > 0 ? parseFloat(((impressions / reach) * 100).toFixed(1)) : 0,
    };
  } catch {
    // If insights permission is not available, return zeros
    return { impressions: 0, reach: 0, profileViews: 0, websiteClicks: 0, engagementRate: 0 };
  }
}

export interface InstagramMedia {
  id: string;
  caption: string;
  mediaType: string;
  timestamp: string;
  likeCount: number;
  commentsCount: number;
  permalink: string;
}

export async function getRecentMedia(limit: number = 12): Promise<InstagramMedia[]> {
  const { instagramId } = await getInstagramConfig();
  const data = await igFetch<{
    data: Array<{
      id: string;
      caption?: string;
      media_type: string;
      timestamp: string;
      like_count: number;
      comments_count: number;
      permalink: string;
    }>;
  }>(`${instagramId}/media`, {
    fields: "id,caption,media_type,timestamp,like_count,comments_count,permalink",
    limit: limit.toString(),
  });

  return data.data.map((m) => ({
    id: m.id,
    caption: m.caption || "",
    mediaType: m.media_type,
    timestamp: m.timestamp,
    likeCount: m.like_count,
    commentsCount: m.comments_count,
    permalink: m.permalink,
  }));
}
