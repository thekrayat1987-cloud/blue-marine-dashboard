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

export interface WhatsAppAttributionData {
  currentMonth: { revenue: number; orders: number; customers: number };
  previousMonth: { revenue: number; orders: number; customers: number };
  monthlyHistory: Array<{ month: string; revenue: number; orders: number }>;
  topCustomers: Array<{
    customerId: string;
    name: string;
    email: string | null;
    phone: string | null;
    ordersCount: number;
    totalSpent: number;
    lastOrderAt: string;
  }>;
  currency: string;
  totalScanned: number;
  attributedCount: number;
}

interface AttributedOrder {
  createdAt: Date;
  amount: number;
  currency: string;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  } | null;
  utmSource: string;
  utmCampaign: string | null;
}

// Free-text WhatsApp signal — covers utm_source=whatsapp, wa, broadcast,
// SuperLemon, native wa.me referrer, etc.
function isWhatsAppSignal(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.toLowerCase();
  return (
    v.includes("whatsapp") ||
    v.includes("wa.me") ||
    v === "wa" ||
    v.includes("superlemon") ||
    v.includes("broadcast")
  );
}

export async function getWhatsAppAttribution(monthsBack = 12): Promise<WhatsAppAttributionData> {
  const now = new Date();
  const rangeStart = new Date(now);
  rangeStart.setUTCMonth(rangeStart.getUTCMonth() - monthsBack, 1);
  rangeStart.setUTCHours(0, 0, 0, 0);

  const startISO = rangeStart.toISOString();
  const endISO = now.toISOString();

  let cursor: string | null = null;
  let scanned = 0;
  const attributed: AttributedOrder[] = [];
  let currency = "KWD";

  for (let page = 0; page < 40; page++) {
    const data: {
      orders: {
        edges: Array<{
          cursor: string;
          node: {
            id: string;
            createdAt: string;
            currentTotalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
            customer: {
              id: string;
              displayName: string | null;
              firstName: string | null;
              lastName: string | null;
              email: string | null;
              phone: string | null;
            } | null;
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
      `query WhatsAppAttribution($q: String!, $cursor: String) {
        orders(first: 100, after: $cursor, query: $q, sortKey: CREATED_AT) {
          edges {
            cursor
            node {
              id
              createdAt
              currentTotalPriceSet { shopMoney { amount currencyCode } }
              customer {
                id
                displayName
                firstName
                lastName
                email
                phone
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
      const first = journey?.firstVisit;
      const last = journey?.lastVisit;

      const signals = [
        first?.utmParameters?.source,
        first?.utmParameters?.medium,
        first?.utmParameters?.campaign,
        first?.source,
        first?.landingPage,
        last?.utmParameters?.source,
        last?.utmParameters?.medium,
        last?.utmParameters?.campaign,
        last?.source,
        last?.landingPage,
      ];

      const matched = signals.some(isWhatsAppSignal);
      if (!matched) continue;

      const customerName =
        n.customer?.displayName ||
        [n.customer?.firstName, n.customer?.lastName].filter(Boolean).join(" ") ||
        "Cliente anonyme";

      attributed.push({
        createdAt: new Date(n.createdAt),
        amount: parseFloat(n.currentTotalPriceSet.shopMoney.amount),
        currency: n.currentTotalPriceSet.shopMoney.currencyCode,
        customer: n.customer
          ? {
              id: n.customer.id,
              name: customerName,
              email: n.customer.email,
              phone: n.customer.phone,
            }
          : null,
        utmSource:
          first?.utmParameters?.source ||
          last?.utmParameters?.source ||
          first?.source ||
          last?.source ||
          "whatsapp",
        utmCampaign:
          first?.utmParameters?.campaign || last?.utmParameters?.campaign || null,
      });
    }

    if (!data.orders.pageInfo.hasNextPage) break;
    cursor = data.orders.edges[data.orders.edges.length - 1]?.cursor ?? null;
    if (!cursor) break;
  }

  // Aggregate by month
  const monthNames = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
  const monthlyMap = new Map<string, { revenue: number; orders: number; sortKey: string }>();
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCMonth(d.getUTCMonth() - i, 1);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    monthlyMap.set(key, { revenue: 0, orders: 0, sortKey: key });
  }
  for (const o of attributed) {
    const key = `${o.createdAt.getUTCFullYear()}-${String(o.createdAt.getUTCMonth() + 1).padStart(2, "0")}`;
    if (monthlyMap.has(key)) {
      const e = monthlyMap.get(key)!;
      e.revenue += o.amount;
      e.orders += 1;
    }
  }
  const monthlyHistory = Array.from(monthlyMap.values())
    .sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1))
    .map((v) => {
      const [y, m] = v.sortKey.split("-").map(Number);
      return {
        month: `${monthNames[m - 1]} ${String(y).slice(2)}`,
        revenue: Math.round(v.revenue * 100) / 100,
        orders: v.orders,
      };
    });

  // Current vs previous month
  const thisKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const prevDate = new Date(now);
  prevDate.setUTCMonth(prevDate.getUTCMonth() - 1);
  const prevKey = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, "0")}`;

  const currentMonthOrders = attributed.filter((o) => {
    const k = `${o.createdAt.getUTCFullYear()}-${String(o.createdAt.getUTCMonth() + 1).padStart(2, "0")}`;
    return k === thisKey;
  });
  const previousMonthOrders = attributed.filter((o) => {
    const k = `${o.createdAt.getUTCFullYear()}-${String(o.createdAt.getUTCMonth() + 1).padStart(2, "0")}`;
    return k === prevKey;
  });

  const uniqueCustomers = (list: AttributedOrder[]) =>
    new Set(list.map((o) => o.customer?.id).filter(Boolean)).size;

  const currentMonth = {
    revenue: Math.round(currentMonthOrders.reduce((s, o) => s + o.amount, 0) * 100) / 100,
    orders: currentMonthOrders.length,
    customers: uniqueCustomers(currentMonthOrders),
  };
  const previousMonth = {
    revenue: Math.round(previousMonthOrders.reduce((s, o) => s + o.amount, 0) * 100) / 100,
    orders: previousMonthOrders.length,
    customers: uniqueCustomers(previousMonthOrders),
  };

  // Top customers (across full window)
  const customerMap = new Map<
    string,
    {
      customerId: string;
      name: string;
      email: string | null;
      phone: string | null;
      ordersCount: number;
      totalSpent: number;
      lastOrderAt: Date;
    }
  >();
  for (const o of attributed) {
    if (!o.customer) continue;
    const c = customerMap.get(o.customer.id);
    if (c) {
      c.ordersCount += 1;
      c.totalSpent += o.amount;
      if (o.createdAt > c.lastOrderAt) c.lastOrderAt = o.createdAt;
    } else {
      customerMap.set(o.customer.id, {
        customerId: o.customer.id,
        name: o.customer.name,
        email: o.customer.email,
        phone: o.customer.phone,
        ordersCount: 1,
        totalSpent: o.amount,
        lastOrderAt: o.createdAt,
      });
    }
  }
  const topCustomers = Array.from(customerMap.values())
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, 10)
    .map((c) => ({
      customerId: c.customerId,
      name: c.name,
      email: c.email,
      phone: c.phone,
      ordersCount: c.ordersCount,
      totalSpent: Math.round(c.totalSpent * 100) / 100,
      lastOrderAt: c.lastOrderAt.toISOString(),
    }));

  return {
    currentMonth,
    previousMonth,
    monthlyHistory,
    topCustomers,
    currency,
    totalScanned: scanned,
    attributedCount: attributed.length,
  };
}
