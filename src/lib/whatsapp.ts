const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN!;
const WHATSAPP_BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID!;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID!;
const META_API_VERSION = "v21.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

async function waFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${META_BASE_URL}/${endpoint}`);
  url.searchParams.set("access_token", META_ACCESS_TOKEN);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(`WhatsApp API error: ${res.status} - ${JSON.stringify(error)}`);
  }
  return res.json();
}

export interface WhatsAppProfile {
  verifiedName: string;
  displayPhoneNumber: string;
  qualityRating: string;
  phoneId: string;
}

export async function getPhoneProfile(): Promise<WhatsAppProfile> {
  const data = await waFetch<{
    verified_name: string;
    display_phone_number: string;
    quality_rating: string;
    id: string;
  }>(WHATSAPP_PHONE_ID, {
    fields: "verified_name,display_phone_number,quality_rating",
  });

  return {
    verifiedName: data.verified_name,
    displayPhoneNumber: data.display_phone_number,
    qualityRating: data.quality_rating,
    phoneId: data.id,
  };
}

export interface WhatsAppAnalytics {
  sentMessages: number;
  deliveredMessages: number;
  readMessages: number;
  receivedMessages: number;
}

export async function getAnalytics(): Promise<WhatsAppAnalytics> {
  try {
    const data = await waFetch<{
      analytics?: {
        phone_numbers: string[];
        data_points: Array<{
          sent: number;
          delivered: number;
          read: number;
          received: number;
        }>;
      };
    }>(`${WHATSAPP_BUSINESS_ACCOUNT_ID}`, {
      fields: "analytics.start(0).end(2147483647).granularity(DAILY).phone_numbers([])",
    });

    if (data.analytics?.data_points?.length) {
      const totals = data.analytics.data_points.reduce(
        (acc, dp) => ({
          sent: acc.sent + (dp.sent || 0),
          delivered: acc.delivered + (dp.delivered || 0),
          read: acc.read + (dp.read || 0),
          received: acc.received + (dp.received || 0),
        }),
        { sent: 0, delivered: 0, read: 0, received: 0 }
      );
      return {
        sentMessages: totals.sent,
        deliveredMessages: totals.delivered,
        readMessages: totals.read,
        receivedMessages: totals.received,
      };
    }
    return { sentMessages: 0, deliveredMessages: 0, readMessages: 0, receivedMessages: 0 };
  } catch {
    return { sentMessages: 0, deliveredMessages: 0, readMessages: 0, receivedMessages: 0 };
  }
}

export interface WhatsAppTemplate {
  name: string;
  status: string;
  category: string;
  language: string;
}

export async function getTemplates(): Promise<WhatsAppTemplate[]> {
  try {
    const data = await waFetch<{
      data: Array<{
        name: string;
        status: string;
        category: string;
        language: string;
      }>;
    }>(`${WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`, {
      fields: "name,status,category,language",
      limit: "20",
    });

    return data.data.map((t) => ({
      name: t.name,
      status: t.status,
      category: t.category,
      language: t.language,
    }));
  } catch {
    return [];
  }
}
