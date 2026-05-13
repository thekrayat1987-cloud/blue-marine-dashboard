const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL!;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const SHOPIFY_GRAPHQL_URL = `https://${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

async function shopifyGraphQL<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(SHOPIFY_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify API ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (json.errors) throw new Error(`Shopify GraphQL: ${JSON.stringify(json.errors)}`);
  return json.data;
}

export type ChannelKey =
  | "meta"
  | "google"
  | "snapchat"
  | "tiktok"
  | "whatsapp"
  | "email"
  | "organic_social"
  | "direct";

export interface BudgetData {
  goalProgress: {
    annualGoal: number;
    ytdRevenue: number;
    ytdOrders: number;
    progressPct: number;
    daysElapsed: number;
    daysTotal: number;
    expectedProgressPct: number;
    projection: number;
    paceStatus: "ahead" | "behind" | "on_track";
  };
  currentMonth: {
    revenue: number;
    orders: number;
    averageOrderValue: number;
    monthlyTarget: number;
    progressPct: number;
  };
  channels: Array<{
    key: ChannelKey;
    label: string;
    revenue30d: number;
    orders30d: number;
  }>;
  categories: Array<{
    productType: string;
    revenue30d: number;
    orders30d: number;
    avgPrice: number;
    quantity: number;
    isBestSeller: boolean;
  }>;
  currency: string;
  ytdOrdersScanned: number;
}

interface OrderRow {
  createdAt: Date;
  amount: number;
  currency: string;
  channel: ChannelKey;
  lineItems: Array<{
    productType: string | null;
    title: string;
    quantity: number;
    revenue: number;
  }>;
}

function detectChannel(signals: Array<string | null | undefined>): ChannelKey {
  const joined = signals
    .filter(Boolean)
    .map((s) => (s as string).toLowerCase())
    .join("|");
  if (!joined) return "direct";

  // WhatsApp / SuperLemon
  if (
    joined.includes("whatsapp") ||
    joined.includes("wa.me") ||
    joined.includes("superlemon") ||
    joined.includes("broadcast")
  ) {
    return "whatsapp";
  }
  // Meta (Facebook/Instagram paid)
  if (
    joined.includes("facebook") ||
    joined.includes("instagram") ||
    joined === "fb" ||
    joined.includes("meta") ||
    joined.includes("paid_social")
  ) {
    // If utm_source is instagram BUT medium not "paid", count as organic_social
    const hasPaid = joined.includes("paid") || joined.includes("cpc") || joined.includes("cpm");
    const hasIgFb =
      joined.includes("instagram") || joined.includes("facebook") || joined.includes("fb");
    if (hasIgFb && !hasPaid) return "organic_social";
    return "meta";
  }
  // Google
  if (joined.includes("google") || joined === "adwords") return "google";
  // Snapchat
  if (joined.includes("snapchat") || joined === "snap") return "snapchat";
  // TikTok
  if (joined.includes("tiktok")) return "tiktok";
  // Email
  if (joined.includes("email") || joined.includes("klaviyo") || joined.includes("mailchimp")) {
    return "email";
  }
  return "direct";
}

const CHANNEL_LABELS: Record<ChannelKey, string> = {
  meta: "Meta Ads (FB/IG)",
  google: "Google Ads",
  snapchat: "Snapchat Ads",
  tiktok: "TikTok Ads",
  whatsapp: "WhatsApp",
  email: "Email",
  organic_social: "Social organique",
  direct: "Direct / Inconnu",
};

export async function getBudgetData(annualGoalKd: number): Promise<BudgetData> {
  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0));
  const startISO = yearStart.toISOString();
  const endISO = now.toISOString();

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));

  let cursor: string | null = null;
  let scanned = 0;
  const orders: OrderRow[] = [];
  let currency = "KWD";

  for (let page = 0; page < 60; page++) {
    const data: {
      orders: {
        edges: Array<{
          cursor: string;
          node: {
            createdAt: string;
            currentTotalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
            lineItems: {
              edges: Array<{
                node: {
                  title: string;
                  quantity: number;
                  product: { productType: string | null } | null;
                  originalTotalSet: { shopMoney: { amount: string } };
                };
              }>;
            };
            customerJourneySummary: {
              firstVisit: {
                source: string | null;
                landingPage: string | null;
                utmParameters: {
                  source: string | null;
                  medium: string | null;
                  campaign: string | null;
                } | null;
              } | null;
              lastVisit: {
                source: string | null;
                landingPage: string | null;
                utmParameters: {
                  source: string | null;
                  medium: string | null;
                  campaign: string | null;
                } | null;
              } | null;
            } | null;
          };
        }>;
        pageInfo: { hasNextPage: boolean };
      };
    } = await shopifyGraphQL(
      `query BudgetOrders($q: String!, $cursor: String) {
        orders(first: 100, after: $cursor, query: $q, sortKey: CREATED_AT) {
          edges {
            cursor
            node {
              createdAt
              currentTotalPriceSet { shopMoney { amount currencyCode } }
              lineItems(first: 30) {
                edges {
                  node {
                    title
                    quantity
                    product { productType }
                    originalTotalSet { shopMoney { amount } }
                  }
                }
              }
              customerJourneySummary {
                firstVisit {
                  source
                  landingPage
                  utmParameters { source medium campaign }
                }
                lastVisit {
                  source
                  landingPage
                  utmParameters { source medium campaign }
                }
              }
            }
          }
          pageInfo { hasNextPage }
        }
      }`,
      { q: `created_at:>=${startISO} created_at:<=${endISO}`, cursor },
    );

    for (const edge of data.orders.edges) {
      scanned += 1;
      const n = edge.node;
      currency = n.currentTotalPriceSet.shopMoney.currencyCode;

      const journey = n.customerJourneySummary;
      const channelSignals = [
        journey?.lastVisit?.utmParameters?.source,
        journey?.lastVisit?.utmParameters?.medium,
        journey?.lastVisit?.utmParameters?.campaign,
        journey?.lastVisit?.source,
        journey?.lastVisit?.landingPage,
        journey?.firstVisit?.utmParameters?.source,
        journey?.firstVisit?.utmParameters?.medium,
        journey?.firstVisit?.utmParameters?.campaign,
        journey?.firstVisit?.source,
        journey?.firstVisit?.landingPage,
      ];

      orders.push({
        createdAt: new Date(n.createdAt),
        amount: parseFloat(n.currentTotalPriceSet.shopMoney.amount),
        currency: n.currentTotalPriceSet.shopMoney.currencyCode,
        channel: detectChannel(channelSignals),
        lineItems: n.lineItems.edges.map((li) => ({
          productType: li.node.product?.productType || null,
          title: li.node.title,
          quantity: li.node.quantity,
          revenue: parseFloat(li.node.originalTotalSet.shopMoney.amount),
        })),
      });
    }

    if (!data.orders.pageInfo.hasNextPage) break;
    cursor = data.orders.edges[data.orders.edges.length - 1]?.cursor ?? null;
    if (!cursor) break;
  }

  // YTD totals
  const ytdRevenue = orders.reduce((s, o) => s + o.amount, 0);
  const ytdOrders = orders.length;

  // Current month
  const monthOrders = orders.filter((o) => o.createdAt >= monthStart);
  const monthRevenue = monthOrders.reduce((s, o) => s + o.amount, 0);
  const monthOrderCount = monthOrders.length;

  // Goal progress
  const daysTotal = isLeapYear(now.getUTCFullYear()) ? 366 : 365;
  const daysElapsed = Math.floor((now.getTime() - yearStart.getTime()) / 86_400_000) + 1;
  const expectedProgressPct = (daysElapsed / daysTotal) * 100;
  const actualProgressPct = annualGoalKd > 0 ? (ytdRevenue / annualGoalKd) * 100 : 0;
  const projection = daysElapsed > 0 ? (ytdRevenue / daysElapsed) * daysTotal : 0;
  const paceStatus: "ahead" | "behind" | "on_track" =
    actualProgressPct > expectedProgressPct + 5
      ? "ahead"
      : actualProgressPct < expectedProgressPct - 5
      ? "behind"
      : "on_track";

  const monthlyTarget = annualGoalKd / 12;
  const monthProgressPct = monthlyTarget > 0 ? (monthRevenue / monthlyTarget) * 100 : 0;

  // Channels — last 30 days
  const recent = orders.filter((o) => o.createdAt >= thirtyDaysAgo);
  const channelMap = new Map<ChannelKey, { revenue: number; orders: number }>();
  for (const o of recent) {
    const c = channelMap.get(o.channel) ?? { revenue: 0, orders: 0 };
    c.revenue += o.amount;
    c.orders += 1;
    channelMap.set(o.channel, c);
  }
  const channels = Array.from(channelMap.entries())
    .map(([key, v]) => ({
      key,
      label: CHANNEL_LABELS[key],
      revenue30d: Math.round(v.revenue * 100) / 100,
      orders30d: v.orders,
    }))
    .sort((a, b) => b.revenue30d - a.revenue30d);

  // Categories — last 30 days
  const categoryMap = new Map<string, { revenue: number; orders: Set<string>; quantity: number }>();
  for (const o of recent) {
    const orderKey = `${o.createdAt.toISOString()}-${o.amount}`;
    for (const li of o.lineItems) {
      const type = (li.productType || "").trim() || "Sans catégorie";
      const c = categoryMap.get(type) ?? { revenue: 0, orders: new Set<string>(), quantity: 0 };
      c.revenue += li.revenue;
      c.orders.add(orderKey);
      c.quantity += li.quantity;
      categoryMap.set(type, c);
    }
  }
  const sortedCategories = Array.from(categoryMap.entries())
    .map(([productType, v]) => ({
      productType,
      revenue30d: Math.round(v.revenue * 100) / 100,
      orders30d: v.orders.size,
      quantity: v.quantity,
      avgPrice: v.quantity > 0 ? Math.round((v.revenue / v.quantity) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.revenue30d - a.revenue30d);
  const categories = sortedCategories.map((c, i) => ({ ...c, isBestSeller: i < 3 }));

  return {
    goalProgress: {
      annualGoal: annualGoalKd,
      ytdRevenue: Math.round(ytdRevenue * 100) / 100,
      ytdOrders,
      progressPct: Math.round(actualProgressPct * 10) / 10,
      daysElapsed,
      daysTotal,
      expectedProgressPct: Math.round(expectedProgressPct * 10) / 10,
      projection: Math.round(projection * 100) / 100,
      paceStatus,
    },
    currentMonth: {
      revenue: Math.round(monthRevenue * 100) / 100,
      orders: monthOrderCount,
      averageOrderValue:
        monthOrderCount > 0 ? Math.round((monthRevenue / monthOrderCount) * 100) / 100 : 0,
      monthlyTarget: Math.round(monthlyTarget * 100) / 100,
      progressPct: Math.round(monthProgressPct * 10) / 10,
    },
    channels,
    categories,
    currency,
    ytdOrdersScanned: scanned,
  };
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}
