import { getIntegrationAccessToken } from "@/lib/integration-tokens";

async function getShopifyConfig(): Promise<{ graphqlUrl: string; token: string }> {
  const store = process.env.SHOPIFY_STORE_URL;
  const token = await getIntegrationAccessToken("shopify", "SHOPIFY_ACCESS_TOKEN");
  const version = process.env.SHOPIFY_API_VERSION || "2024-10";
  if (!store || !token) throw new Error("SHOPIFY_STORE_URL or SHOPIFY_ACCESS_TOKEN missing");
  return { graphqlUrl: `https://${store}/admin/api/${version}/graphql.json`, token };
}

async function shopifyGraphQL<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const cfg = await getShopifyConfig();
  const res = await fetch(cfg.graphqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": cfg.token,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify API ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (json.errors) throw new Error(`Shopify GraphQL: ${JSON.stringify(json.errors)}`);
  return json.data;
}

export type SegmentType = "vip" | "inactive_60" | "inactive_90" | "by_country" | "by_product_tag" | "all_buyers";

export type GccCountry = "KW" | "SA" | "AE" | "QA" | "BH" | "OM";

const COUNTRY_LABEL_AR: Record<GccCountry, string> = {
  KW: "الكويت",
  SA: "السعودية",
  AE: "الإمارات",
  QA: "قطر",
  BH: "البحرين",
  OM: "عُمان",
};

const COUNTRY_LABEL_FR: Record<GccCountry, string> = {
  KW: "Koweït",
  SA: "Arabie Saoudite",
  AE: "Émirats",
  QA: "Qatar",
  BH: "Bahreïn",
  OM: "Oman",
};

export type SegmentFilter = {
  type: SegmentType;
  country?: GccCountry;
  productTag?: string;
  minOrders?: number;
  minSpentKwd?: number;
};

export type SegmentPreview = {
  count: number;
  avgSpentKwd: number;
  totalSpentKwd: number;
  topCountries: Array<{ code: string; count: number }>;
  daysSinceLastOrderMedian: number | null;
  shopifyQuery: string;
  countryLabelAr?: string;
  countryLabelFr?: string;
  sampleEmails: string[];
};

/**
 * Build a Shopify customer search query string from the segment filter.
 * Reference: https://shopify.dev/docs/api/usage/search-syntax
 */
export function buildShopifyQuery(f: SegmentFilter): string {
  const clauses: string[] = [];

  if (f.type === "vip") {
    clauses.push(`orders_count:>=${f.minOrders ?? 2}`);
    if (f.minSpentKwd) clauses.push(`total_spent:>=${f.minSpentKwd}`);
  } else if (f.type === "inactive_60") {
    const date = isoDaysAgo(60);
    clauses.push(`orders_count:>=1`);
    clauses.push(`last_order_date:<${date}`);
  } else if (f.type === "inactive_90") {
    const date = isoDaysAgo(90);
    clauses.push(`orders_count:>=1`);
    clauses.push(`last_order_date:<${date}`);
  } else if (f.type === "by_country" && f.country) {
    clauses.push(`country:${f.country}`);
  } else if (f.type === "by_product_tag" && f.productTag) {
    clauses.push(`tag:${f.productTag}`);
  } else if (f.type === "all_buyers") {
    clauses.push(`orders_count:>=1`);
  }

  return clauses.join(" AND ");
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function previewSegment(filter: SegmentFilter): Promise<SegmentPreview> {
  const shopifyQuery = buildShopifyQuery(filter);

  type QueryResp = {
    customers: {
      edges: Array<{
        node: {
          id: string;
          email: string | null;
          numberOfOrders: string;
          amountSpent: { amount: string; currencyCode: string };
          defaultAddress: { countryCodeV2: string | null } | null;
          lastOrder: { createdAt: string } | null;
        };
      }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };

  const collected: QueryResp["customers"]["edges"] = [];
  let cursor: string | null = null;
  let hasNext = true;
  const MAX_PAGES = 4;
  let page = 0;
  while (hasNext && page < MAX_PAGES) {
    page += 1;
    const data: QueryResp = await shopifyGraphQL<QueryResp>(
      `query Seg($q: String!, $after: String) {
        customers(first: 250, query: $q, after: $after) {
          edges {
            node {
              id
              email
              numberOfOrders
              amountSpent { amount currencyCode }
              defaultAddress { countryCodeV2 }
              lastOrder { createdAt }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { q: shopifyQuery, after: cursor },
    );
    collected.push(...data.customers.edges);
    hasNext = data.customers.pageInfo.hasNextPage;
    cursor = data.customers.pageInfo.endCursor;
  }

  const count = collected.length;
  const spent = collected.map((e) => Number(e.node.amountSpent.amount) || 0);
  const totalSpent = spent.reduce((a, b) => a + b, 0);
  const avgSpent = count > 0 ? totalSpent / count : 0;

  const countryCounts: Record<string, number> = {};
  for (const e of collected) {
    const c = e.node.defaultAddress?.countryCodeV2 || "??";
    countryCounts[c] = (countryCounts[c] || 0) + 1;
  }
  const topCountries = Object.entries(countryCounts)
    .map(([code, c]) => ({ code, count: c }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  const now = Date.now();
  const lastOrderDays = collected
    .map((e) => e.node.lastOrder?.createdAt)
    .filter((d): d is string => Boolean(d))
    .map((d) => Math.floor((now - new Date(d).getTime()) / 86400000))
    .sort((a, b) => a - b);
  const daysSinceLastOrderMedian =
    lastOrderDays.length > 0
      ? lastOrderDays[Math.floor(lastOrderDays.length / 2)]
      : null;

  const sampleEmails = collected
    .slice(0, 5)
    .map((e) => e.node.email)
    .filter((e): e is string => Boolean(e));

  return {
    count,
    avgSpentKwd: Math.round(avgSpent * 100) / 100,
    totalSpentKwd: Math.round(totalSpent * 100) / 100,
    topCountries,
    daysSinceLastOrderMedian,
    shopifyQuery,
    countryLabelAr: filter.country ? COUNTRY_LABEL_AR[filter.country] : undefined,
    countryLabelFr: filter.country ? COUNTRY_LABEL_FR[filter.country] : undefined,
    sampleEmails,
  };
}

/**
 * Pull recent order timestamps to estimate the best send time per country.
 * Returns top 3 hour-of-week buckets in KW timezone (UTC+3).
 */
export type SendTimeSignal = {
  topHoursKwTime: Array<{ hour: number; dayLabel: string; orders: number }>;
};

export async function getOptimalSendTimeSignal(): Promise<SendTimeSignal> {
  const sinceDate = isoDaysAgo(180);
  type Resp = {
    orders: {
      edges: Array<{ node: { createdAt: string } }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
  const collected: string[] = [];
  let cursor: string | null = null;
  let hasNext = true;
  let page = 0;
  while (hasNext && page < 4) {
    page += 1;
    const data: Resp = await shopifyGraphQL<Resp>(
      `query Ord($q: String!, $after: String) {
        orders(first: 250, query: $q, after: $after, sortKey: CREATED_AT) {
          edges { node { createdAt } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { q: `created_at:>=${sinceDate}`, after: cursor },
    );
    collected.push(...data.orders.edges.map((e) => e.node.createdAt));
    hasNext = data.orders.pageInfo.hasNextPage;
    cursor = data.orders.pageInfo.endCursor;
  }

  const dayNames = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const buckets: Record<string, { hour: number; dayLabel: string; orders: number }> = {};
  for (const iso of collected) {
    const d = new Date(iso);
    const utcHour = d.getUTCHours();
    const kwHour = (utcHour + 3) % 24;
    const utcDay = d.getUTCDay();
    let kwDay = utcDay;
    if (utcHour + 3 >= 24) kwDay = (utcDay + 1) % 7;
    const key = `${kwDay}-${kwHour}`;
    if (!buckets[key]) {
      buckets[key] = { hour: kwHour, dayLabel: dayNames[kwDay], orders: 0 };
    }
    buckets[key].orders += 1;
  }

  const topHoursKwTime = Object.values(buckets)
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 3);

  return { topHoursKwTime };
}
