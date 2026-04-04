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

  if (!res.ok) {
    throw new Error(`Shopify API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

export interface ShopifyOrderMetrics {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  monthlyBreakdown: Array<{
    month: string;
    revenue: number;
    orders: number;
  }>;
}

export async function getOrderMetrics(year: number = new Date().getFullYear()): Promise<ShopifyOrderMetrics> {
  const startDate = `${year}-01-01T00:00:00Z`;
  const endDate = `${year}-12-31T23:59:59Z`;

  const data = await shopifyGraphQL<{
    orders: {
      edges: Array<{
        node: {
          createdAt: string;
          totalPriceSet: { shopMoney: { amount: string } };
        };
      }>;
      pageInfo: { hasNextPage: boolean; endCursor: string };
    };
  }>(`
    query OrderMetrics($query: String!) {
      orders(first: 250, query: $query, sortKey: CREATED_AT) {
        edges {
          node {
            createdAt
            totalPriceSet {
              shopMoney {
                amount
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `, { query: `created_at:>=${startDate} created_at:<=${endDate}` });

  const orders = data.orders.edges.map((e) => ({
    createdAt: new Date(e.node.createdAt),
    amount: parseFloat(e.node.totalPriceSet.shopMoney.amount),
  }));

  const monthlyMap = new Map<number, { revenue: number; orders: number }>();
  for (let i = 0; i < 12; i++) {
    monthlyMap.set(i, { revenue: 0, orders: 0 });
  }

  for (const order of orders) {
    const month = order.createdAt.getMonth();
    const entry = monthlyMap.get(month)!;
    entry.revenue += order.amount;
    entry.orders += 1;
  }

  const monthNames = ["Jan", "Fev", "Mar", "Avr", "Mai", "Jun", "Jul", "Aout", "Sep", "Oct", "Nov", "Dec"];
  const monthlyBreakdown = Array.from(monthlyMap.entries()).map(([month, data]) => ({
    month: monthNames[month],
    revenue: Math.round(data.revenue),
    orders: data.orders,
  }));

  const totalRevenue = orders.reduce((sum, o) => sum + o.amount, 0);
  const totalOrders = orders.length;

  return {
    totalRevenue: Math.round(totalRevenue),
    totalOrders,
    averageOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
    monthlyBreakdown,
  };
}

export interface ShopifyProduct {
  title: string;
  totalInventory: number;
  priceRange: { minVariantPrice: number; maxVariantPrice: number };
}

export async function getProducts(): Promise<ShopifyProduct[]> {
  const data = await shopifyGraphQL<{
    products: {
      edges: Array<{
        node: {
          title: string;
          totalInventory: number;
          priceRangeV2: {
            minVariantPrice: { amount: string };
            maxVariantPrice: { amount: string };
          };
        };
      }>;
    };
  }>(`
    query Products {
      products(first: 50, sortKey: BEST_SELLING) {
        edges {
          node {
            title
            totalInventory
            priceRangeV2 {
              minVariantPrice { amount }
              maxVariantPrice { amount }
            }
          }
        }
      }
    }
  `);

  return data.products.edges.map((e) => ({
    title: e.node.title,
    totalInventory: e.node.totalInventory,
    priceRange: {
      minVariantPrice: parseFloat(e.node.priceRangeV2.minVariantPrice.amount),
      maxVariantPrice: parseFloat(e.node.priceRangeV2.maxVariantPrice.amount),
    },
  }));
}
