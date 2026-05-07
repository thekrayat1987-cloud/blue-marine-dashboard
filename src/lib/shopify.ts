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

// ─────────────────────────────────────────────────────────────────────────────
// Order analytics — full breakdown for /analytics page
// ─────────────────────────────────────────────────────────────────────────────

export interface OrderAnalytics {
  range: { start: string; end: string; days: number };
  totals: {
    revenue: number;
    orders: number;
    averageOrderValue: number;
    uniqueCustomers: number;
    repeatCustomers: number;
    repeatCustomerRate: number;
  };
  daily: Array<{ date: string; revenue: number; orders: number }>;
  weekly: Array<{ weekStart: string; label: string; revenue: number; orders: number }>;
  monthly: Array<{ month: string; revenue: number; orders: number }>;
  topProducts: Array<{
    productId: string | null;
    title: string;
    sku: string | null;
    quantity: number;
    revenue: number;
  }>;
  ramadanComparison: {
    ramadan: { label: string; start: string; end: string; revenue: number; orders: number; aov: number; dailyAvg: number };
    normal: { label: string; start: string; end: string; revenue: number; orders: number; aov: number; dailyAvg: number };
    lift: { revenuePct: number; ordersPct: number; aovPct: number };
  } | null;
  currency: string;
}

// Lunar calendar — Ramadan windows. Update each year as needed.
const RAMADAN_WINDOWS: Array<{ year: number; start: string; end: string }> = [
  { year: 2024, start: "2024-03-11", end: "2024-04-09" },
  { year: 2025, start: "2025-03-01", end: "2025-03-30" },
  { year: 2026, start: "2026-02-18", end: "2026-03-19" },
  { year: 2027, start: "2027-02-08", end: "2027-03-09" },
];

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getUTCDay(); // 0=Sun
  // Treat Saturday as week start (Kuwait week convention)
  const diff = (day + 1) % 7;
  x.setUTCDate(x.getUTCDate() - diff);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

interface RawOrder {
  createdAt: Date;
  amount: number;
  currency: string;
  customerId: string | null;
  lineItems: Array<{
    productId: string | null;
    title: string;
    sku: string | null;
    quantity: number;
    revenue: number;
  }>;
}

async function fetchOrdersInRange(startISO: string, endISO: string): Promise<RawOrder[]> {
  const orders: RawOrder[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 40; page++) {
    const data: {
      orders: {
        edges: Array<{
          cursor: string;
          node: {
            createdAt: string;
            customer: { id: string } | null;
            currentTotalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
            lineItems: {
              edges: Array<{
                node: {
                  title: string;
                  quantity: number;
                  sku: string | null;
                  product: { id: string } | null;
                  originalTotalSet: { shopMoney: { amount: string } };
                };
              }>;
            };
          };
        }>;
        pageInfo: { hasNextPage: boolean };
      };
    } = await shopifyGraphQL(
      `query OrdersAnalytics($q: String!, $cursor: String) {
        orders(first: 100, after: $cursor, query: $q, sortKey: CREATED_AT) {
          edges {
            cursor
            node {
              createdAt
              customer { id }
              currentTotalPriceSet { shopMoney { amount currencyCode } }
              lineItems(first: 30) {
                edges {
                  node {
                    title
                    quantity
                    sku
                    product { id }
                    originalTotalSet { shopMoney { amount } }
                  }
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
      const n = edge.node;
      orders.push({
        createdAt: new Date(n.createdAt),
        amount: parseFloat(n.currentTotalPriceSet.shopMoney.amount),
        currency: n.currentTotalPriceSet.shopMoney.currencyCode,
        customerId: n.customer?.id ?? null,
        lineItems: n.lineItems.edges.map((li) => ({
          productId: li.node.product?.id ?? null,
          title: li.node.title,
          sku: li.node.sku,
          quantity: li.node.quantity,
          revenue: parseFloat(li.node.originalTotalSet.shopMoney.amount),
        })),
      });
    }

    if (!data.orders.pageInfo.hasNextPage) break;
    cursor = data.orders.edges[data.orders.edges.length - 1]?.cursor ?? null;
    if (!cursor) break;
  }
  return orders;
}

function summarizeOrders(orders: RawOrder[]) {
  const revenue = orders.reduce((s, o) => s + o.amount, 0);
  const customers = new Set<string>();
  const customerCounts = new Map<string, number>();
  for (const o of orders) {
    if (o.customerId) {
      customers.add(o.customerId);
      customerCounts.set(o.customerId, (customerCounts.get(o.customerId) ?? 0) + 1);
    }
  }
  const repeat = Array.from(customerCounts.values()).filter((c) => c >= 2).length;
  return {
    revenue,
    orders: orders.length,
    aov: orders.length ? revenue / orders.length : 0,
    uniqueCustomers: customers.size,
    repeatCustomers: repeat,
  };
}

export async function getOrderAnalytics(daysBack: number = 365): Promise<OrderAnalytics> {
  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - daysBack);
  start.setUTCHours(0, 0, 0, 0);

  const startISO = start.toISOString();
  const endISO = now.toISOString();

  const orders = await fetchOrdersInRange(startISO, endISO);
  const currency = orders[0]?.currency ?? "KWD";

  // Totals
  const summary = summarizeOrders(orders);

  // Daily breakdown — last 30 days only (chart-friendly)
  const dailyMap = new Map<string, { revenue: number; orders: number }>();
  const dailyStart = new Date(now);
  dailyStart.setUTCDate(dailyStart.getUTCDate() - 29);
  dailyStart.setUTCHours(0, 0, 0, 0);
  for (let d = new Date(dailyStart); d <= now; d.setUTCDate(d.getUTCDate() + 1)) {
    dailyMap.set(isoDay(d), { revenue: 0, orders: 0 });
  }
  for (const o of orders) {
    const k = isoDay(o.createdAt);
    if (dailyMap.has(k)) {
      const e = dailyMap.get(k)!;
      e.revenue += o.amount;
      e.orders += 1;
    }
  }
  const daily = Array.from(dailyMap.entries()).map(([date, v]) => ({
    date,
    revenue: Math.round(v.revenue * 100) / 100,
    orders: v.orders,
  }));

  // Weekly breakdown — last 12 weeks
  const weeklyMap = new Map<string, { revenue: number; orders: number }>();
  const weekStartCursor = startOfWeek(new Date(now));
  for (let i = 0; i < 12; i++) {
    const ws = new Date(weekStartCursor);
    ws.setUTCDate(ws.getUTCDate() - i * 7);
    weeklyMap.set(isoDay(ws), { revenue: 0, orders: 0 });
  }
  for (const o of orders) {
    const ws = isoDay(startOfWeek(o.createdAt));
    if (weeklyMap.has(ws)) {
      const e = weeklyMap.get(ws)!;
      e.revenue += o.amount;
      e.orders += 1;
    }
  }
  const weekly = Array.from(weeklyMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([weekStart, v]) => {
      const wd = new Date(weekStart);
      const label = wd.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", timeZone: "UTC" });
      return {
        weekStart,
        label,
        revenue: Math.round(v.revenue * 100) / 100,
        orders: v.orders,
      };
    });

  // Monthly breakdown — last 12 months
  const monthNames = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
  const monthlyMap = new Map<string, { revenue: number; orders: number; sortKey: string }>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCMonth(d.getUTCMonth() - i, 1);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    monthlyMap.set(key, { revenue: 0, orders: 0, sortKey: key });
  }
  for (const o of orders) {
    const key = `${o.createdAt.getUTCFullYear()}-${String(o.createdAt.getUTCMonth() + 1).padStart(2, "0")}`;
    if (monthlyMap.has(key)) {
      const e = monthlyMap.get(key)!;
      e.revenue += o.amount;
      e.orders += 1;
    }
  }
  const monthly = Array.from(monthlyMap.values())
    .sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1))
    .map((v) => {
      const [y, m] = v.sortKey.split("-").map(Number);
      const label = `${monthNames[m - 1]} ${String(y).slice(2)}`;
      return { month: label, revenue: Math.round(v.revenue * 100) / 100, orders: v.orders };
    });

  // Top products
  const productMap = new Map<string, { productId: string | null; title: string; sku: string | null; quantity: number; revenue: number }>();
  for (const o of orders) {
    for (const li of o.lineItems) {
      const key = li.productId ?? `title:${li.title}`;
      const existing = productMap.get(key);
      if (existing) {
        existing.quantity += li.quantity;
        existing.revenue += li.revenue;
        if (!existing.sku && li.sku) existing.sku = li.sku;
      } else {
        productMap.set(key, {
          productId: li.productId,
          title: li.title,
          sku: li.sku,
          quantity: li.quantity,
          revenue: li.revenue,
        });
      }
    }
  }
  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map((p) => ({ ...p, revenue: Math.round(p.revenue * 100) / 100 }));

  // Ramadan vs normal comparison — find most recent Ramadan within the range
  let ramadanComparison: OrderAnalytics["ramadanComparison"] = null;
  const recentRamadan = [...RAMADAN_WINDOWS]
    .reverse()
    .find((r) => new Date(r.end) <= now && new Date(r.start) >= start);
  if (recentRamadan) {
    const rStart = new Date(recentRamadan.start);
    const rEnd = new Date(recentRamadan.end);
    const days = Math.max(1, Math.round((rEnd.getTime() - rStart.getTime()) / 86_400_000) + 1);
    const ramadanOrders = orders.filter((o) => o.createdAt >= rStart && o.createdAt <= rEnd);

    // Normal period: same number of days, ending the day before Ramadan started
    const nEnd = new Date(rStart);
    nEnd.setUTCDate(nEnd.getUTCDate() - 1);
    const nStart = new Date(nEnd);
    nStart.setUTCDate(nStart.getUTCDate() - days + 1);
    const normalOrders = orders.filter((o) => o.createdAt >= nStart && o.createdAt <= nEnd);

    const r = summarizeOrders(ramadanOrders);
    const n = summarizeOrders(normalOrders);
    const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : 0);

    ramadanComparison = {
      ramadan: {
        label: `Ramadan ${recentRamadan.year}`,
        start: recentRamadan.start,
        end: recentRamadan.end,
        revenue: Math.round(r.revenue * 100) / 100,
        orders: r.orders,
        aov: Math.round(r.aov * 100) / 100,
        dailyAvg: Math.round((r.revenue / days) * 100) / 100,
      },
      normal: {
        label: `Période normale (${days}j avant)`,
        start: isoDay(nStart),
        end: isoDay(nEnd),
        revenue: Math.round(n.revenue * 100) / 100,
        orders: n.orders,
        aov: Math.round(n.aov * 100) / 100,
        dailyAvg: Math.round((n.revenue / days) * 100) / 100,
      },
      lift: {
        revenuePct: pct(r.revenue, n.revenue),
        ordersPct: pct(r.orders, n.orders),
        aovPct: pct(r.aov, n.aov),
      },
    };
  }

  return {
    range: { start: isoDay(start), end: isoDay(now), days: daysBack },
    totals: {
      revenue: Math.round(summary.revenue * 100) / 100,
      orders: summary.orders,
      averageOrderValue: Math.round(summary.aov * 100) / 100,
      uniqueCustomers: summary.uniqueCustomers,
      repeatCustomers: summary.repeatCustomers,
      repeatCustomerRate: summary.uniqueCustomers > 0
        ? Math.round((summary.repeatCustomers / summary.uniqueCustomers) * 1000) / 10
        : 0,
    },
    daily,
    weekly,
    monthly,
    topProducts,
    ramadanComparison,
    currency,
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

export interface ShopifyProductLite {
  id: string;
  title: string;
  handle: string;
  imageUrl: string | null;
  options: Array<{ name: string; values: string[] }>;
}

export async function searchProducts(query: string): Promise<ShopifyProductLite[]> {
  const search = query.trim();
  const data = await shopifyGraphQL<{
    products: {
      edges: Array<{
        node: {
          id: string;
          title: string;
          handle: string;
          featuredImage: { url: string } | null;
          options: Array<{ name: string; values: string[] }>;
        };
      }>;
    };
  }>(
    `query Products($q: String) {
      products(first: 20, query: $q, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            title
            handle
            featuredImage { url }
            options { name values }
          }
        }
      }
    }`,
    { q: search ? `title:*${search}* OR sku:*${search}*` : null },
  );
  return data.products.edges.map((e) => ({
    id: e.node.id,
    title: e.node.title,
    handle: e.node.handle,
    imageUrl: e.node.featuredImage?.url ?? null,
    options: e.node.options,
  }));
}

export async function getNextSku(): Promise<string> {
  // Pull product titles + variant SKUs across the store and look for
  // the recurring "<LETTER><NUMBER>" pattern Khadija uses (e.g. A122).
  // Letter is taken from the highest-numbered match; number is incremented
  // and zero-padded to the original width.
  const re = /\b([A-Z])(\d{2,5})\b/;
  let bestLetter = "A";
  let bestNum = 0;
  let bestWidth = 3;

  let cursor: string | null = null;
  for (let page = 0; page < 10; page++) {
    const data: {
      products: {
        edges: Array<{
          cursor: string;
          node: {
            title: string;
            variants: { edges: Array<{ node: { sku: string | null } }> };
          };
        }>;
        pageInfo: { hasNextPage: boolean };
      };
    } = await shopifyGraphQL(
      `query NextSkuScan($cursor: String) {
        products(first: 100, after: $cursor, sortKey: CREATED_AT, reverse: true) {
          edges {
            cursor
            node {
              title
              variants(first: 10) { edges { node { sku } } }
            }
          }
          pageInfo { hasNextPage }
        }
      }`,
      { cursor },
    );

    for (const edge of data.products.edges) {
      const candidates: string[] = [edge.node.title];
      for (const v of edge.node.variants.edges) {
        if (v.node.sku) candidates.push(v.node.sku);
      }
      for (const c of candidates) {
        const m = c.match(re);
        if (!m) continue;
        const letter = m[1];
        const num = parseInt(m[2], 10);
        const width = m[2].length;
        if (num > bestNum) {
          bestNum = num;
          bestLetter = letter;
          bestWidth = width;
        }
      }
    }

    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.edges[data.products.edges.length - 1]?.cursor ?? null;
    if (!cursor) break;
  }

  const next = bestNum + 1;
  return `${bestLetter}${String(next).padStart(bestWidth, "0")}`;
}

// Mirrors the regex used in scripts/rename-products.mjs to seed the
// "forbidden names" list so the AI doesn't reuse a poetic name already
// in the catalogue.
export async function getUsedPoeticNames(): Promise<string[]> {
  const re = /^[A-Z]\d{1,4}\s*[–\-]\s*([A-Z][\w']+(?:\s+[A-Z][\w']+)?)/;
  const names = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < 5; page++) {
    const data: {
      products: {
        edges: Array<{ cursor: string; node: { title: string } }>;
        pageInfo: { hasNextPage: boolean };
      };
    } = await shopifyGraphQL(
      `query UsedNames($cursor: String) {
        products(first: 100, after: $cursor) {
          edges { cursor node { title } }
          pageInfo { hasNextPage }
        }
      }`,
      { cursor },
    );
    for (const edge of data.products.edges) {
      const m = edge.node.title.match(re);
      if (m) names.add(m[1]);
    }
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.edges[data.products.edges.length - 1]?.cursor ?? null;
    if (!cursor) break;
  }
  return [...names].sort();
}

export interface ShopifyCollection {
  id: string;
  title: string;
  handle: string;
}

export async function getCollections(): Promise<ShopifyCollection[]> {
  const data = await shopifyGraphQL<{
    collections: { edges: Array<{ node: { id: string; title: string; handle: string } }> };
  }>(`
    query Collections {
      collections(first: 100, sortKey: TITLE) {
        edges { node { id title handle } }
      }
    }
  `);
  return data.collections.edges.map((e) => e.node);
}

function paragraphsToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

interface StagedTarget {
  url: string;
  resourceUrl: string;
  parameters: Array<{ name: string; value: string }>;
}

async function stagedUploadCreate(params: {
  filename: string;
  mimeType: string;
  fileSize: number;
}): Promise<StagedTarget> {
  const data = await shopifyGraphQL<{
    stagedUploadsCreate: {
      stagedTargets: StagedTarget[];
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(
    `mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`,
    {
      input: [
        {
          resource: "IMAGE",
          filename: params.filename,
          mimeType: params.mimeType,
          fileSize: String(params.fileSize),
          httpMethod: "POST",
        },
      ],
    },
  );

  if (data.stagedUploadsCreate.userErrors.length) {
    throw new Error(
      `stagedUploadsCreate: ${data.stagedUploadsCreate.userErrors.map((e) => e.message).join(", ")}`,
    );
  }
  const target = data.stagedUploadsCreate.stagedTargets[0];
  if (!target) throw new Error("No staged target returned");
  return target;
}

async function uploadToStagedTarget(
  target: StagedTarget,
  imageBuffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<void> {
  const form = new FormData();
  for (const param of target.parameters) {
    form.append(param.name, param.value);
  }
  const blob = new Blob([new Uint8Array(imageBuffer)], { type: mimeType });
  form.append("file", blob, filename);

  const res = await fetch(target.url, { method: "POST", body: form });
  if (!res.ok && res.status !== 201 && res.status !== 204) {
    const text = await res.text().catch(() => "");
    throw new Error(`Image upload failed: ${res.status} ${text.slice(0, 200)}`);
  }
}

export interface PushProductImage {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

export interface PushProductParams {
  images: PushProductImage[];
  sku: string;
  vendor: string;
  enTitle: string;
  enDescription: string;
  enHandle: string;
  enSeoTitle: string;
  enSeoDescription: string;
  arTitle: string;
  arDescription: string;
  arSeoTitle: string;
  arSeoDescription: string;
  price: string;
  tags: string[];
  collectionIds: string[];
  inventoryQuantity?: number;
  principalColor?: string;
}

const TRADITIONAL_CLOTHING_CATEGORY = "gid://shopify/TaxonomyCategory/aa-1-23";
const DEFAULT_LOCATION_ID = "gid://shopify/Location/108480495916";
const DEFAULT_INVENTORY_QUANTITY = 5;
const DEFAULT_WEIGHT_KG = 1;

// Google Shopping metafields + customs fields applied on every new product.
const GOOGLE_SHOPPING_NAMESPACE = "mm-google-shopping";
const HARMONIZED_SYSTEM_CODE = "6204.49"; // women's other-material clothing
const COUNTRY_OF_ORIGIN = "KW"; // Kuwait
const SLEEVE_LENGTH_LONG_METAOBJECT_GID =
  "gid://shopify/Metaobject/185829523756"; // shopify--sleeve-length-type/long

async function applyCustomsToInventoryItems(
  inventoryItemIds: string[],
): Promise<string[]> {
  const warnings: string[] = [];
  for (const itemId of inventoryItemIds) {
    try {
      const updRes = await shopifyGraphQL<{
        inventoryItemUpdate: {
          userErrors: Array<{ field: string[]; message: string }>;
        };
      }>(
        `mutation InventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
          inventoryItemUpdate(id: $id, input: $input) {
            userErrors { field message }
          }
        }`,
        {
          id: itemId,
          input: {
            countryCodeOfOrigin: COUNTRY_OF_ORIGIN,
            harmonizedSystemCode: HARMONIZED_SYSTEM_CODE,
            tracked: true,
          },
        },
      );
      if (updRes.inventoryItemUpdate.userErrors.length) {
        warnings.push(
          `Inventory item ${itemId}: ${updRes.inventoryItemUpdate.userErrors.map((e) => e.message).join(", ")}`,
        );
      }
    } catch (err) {
      warnings.push(
        err instanceof Error ? `Inventory item ${itemId}: ${err.message}` : "Inventory item update failed",
      );
    }
  }
  return warnings;
}

export interface PushProductResult {
  productId: string;
  productHandle: string;
  adminUrl: string;
  warnings: string[];
}

export async function pushProductToShopify(
  params: PushProductParams,
): Promise<PushProductResult> {
  const warnings: string[] = [];

  if (params.images.length === 0) {
    throw new Error("At least one image is required");
  }

  const seoSlug = slugify(params.enHandle) || slugify(params.enTitle) || "product";
  const seoAlt = `${params.enSeoTitle || params.enTitle} — ${params.vendor}`.slice(0, 125);

  const stagedResources: string[] = [];
  for (let i = 0; i < params.images.length; i++) {
    const img = params.images[i];
    const ext = img.filename.split(".").pop() ?? (img.mimeType === "image/jpeg" ? "jpg" : "png");
    const seoFilename = params.images.length > 1
      ? `${seoSlug}-${i + 1}.${ext}`
      : `${seoSlug}.${ext}`;

    const staged = await stagedUploadCreate({
      filename: seoFilename,
      mimeType: img.mimeType,
      fileSize: img.buffer.length,
    });
    await uploadToStagedTarget(staged, img.buffer, img.mimeType, seoFilename);
    stagedResources.push(staged.resourceUrl);
  }

  const productCreateData = await shopifyGraphQL<{
    productCreate: {
      product: { id: string; handle: string } | null;
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(
    `mutation ProductCreate($input: ProductInput!, $media: [CreateMediaInput!]) {
      productCreate(input: $input, media: $media) {
        product { id handle }
        userErrors { field message }
      }
    }`,
    {
      input: {
        title: params.enTitle,
        descriptionHtml: paragraphsToHtml(params.enDescription),
        vendor: params.vendor,
        handle: params.enHandle,
        tags: params.tags,
        status: "ACTIVE",
        category: TRADITIONAL_CLOTHING_CATEGORY,
        seo: { title: params.enSeoTitle, description: params.enSeoDescription },
        productOptions: [
          {
            name: "Size",
            values: [
              { name: "XS" },
              { name: "S" },
              { name: "M" },
              { name: "L" },
              { name: "XL" },
              { name: "2XL" },
              { name: "3XL" },
            ],
          },
          {
            name: LENGTH_OPTION_NAME,
            values: LENGTH_VALUES.map((v) => ({ name: v })),
          },
          ...(params.principalColor
            ? [
                {
                  name: "Color",
                  values: [{ name: params.principalColor }],
                },
              ]
            : []),
        ],
      },
      media: stagedResources.map((resourceUrl) => ({
        alt: seoAlt,
        mediaContentType: "IMAGE",
        originalSource: resourceUrl,
      })),
    },
  );

  if (productCreateData.productCreate.userErrors.length) {
    throw new Error(
      `productCreate: ${productCreateData.productCreate.userErrors.map((e) => `${e.field?.join(".")}: ${e.message}`).join(" | ")}`,
    );
  }
  const product = productCreateData.productCreate.product;
  if (!product) throw new Error("productCreate returned no product");

  // Shopify productCreate auto-creates ONE variant (Size=XS, Length=first).
  // Create the remaining (Size × Length) - 1 variants so the product has all combinations.
  try {
    const allSizes = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
    const firstLength = LENGTH_VALUES[0];
    const missingVariants: Array<{
      optionValues: Array<{ optionName: string; name: string }>;
      price: string;
      inventoryItem: {
        sku: string;
        tracked: boolean;
        measurement: { weight: { value: number; unit: string } };
      };
    }> = [];
    for (const size of allSizes) {
      for (const length of LENGTH_VALUES) {
        if (size === "XS" && length === firstLength) continue; // auto-created
        missingVariants.push({
          optionValues: [
            { optionName: "Size", name: size },
            { optionName: LENGTH_OPTION_NAME, name: length },
            ...(params.principalColor
              ? [{ optionName: "Color", name: params.principalColor }]
              : []),
          ],
          price: params.price,
          inventoryItem: {
            sku: params.sku,
            tracked: true,
            measurement: { weight: { value: DEFAULT_WEIGHT_KG, unit: "KILOGRAMS" } },
          },
        });
      }
    }
    const bulkCreateRes = await shopifyGraphQL<{
      productVariantsBulkCreate: {
        userErrors: Array<{ field: string[]; message: string }>;
      };
    }>(
      `mutation VariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkCreate(productId: $productId, variants: $variants) {
          userErrors { field message }
        }
      }`,
      { productId: product.id, variants: missingVariants },
    );
    if (bulkCreateRes.productVariantsBulkCreate.userErrors.length) {
      warnings.push(
        `Size×Length variants create: ${bulkCreateRes.productVariantsBulkCreate.userErrors.map((e) => e.message).join(", ")}`,
      );
    }
  } catch (err) {
    warnings.push(err instanceof Error ? `Size×Length variants: ${err.message}` : "Size×Length variants create failed");
  }

  // Set price, SKU, weight, tracking + seed inventory on every Size variant
  const initialQty = params.inventoryQuantity ?? DEFAULT_INVENTORY_QUANTITY;
  try {
    const variantsData = await shopifyGraphQL<{
      product: {
        variants: { edges: Array<{ node: { id: string; inventoryItem: { id: string } } }> };
      } | null;
    }>(
      `query ProductVariants($id: ID!) {
        product(id: $id) {
          variants(first: 100) { edges { node { id inventoryItem { id } } } }
        }
      }`,
      { id: product.id },
    );
    const variantNodes = variantsData.product?.variants.edges.map((e) => e.node) ?? [];
    if (variantNodes.length) {
      const updateRes = await shopifyGraphQL<{
        productVariantsBulkUpdate: {
          userErrors: Array<{ field: string[]; message: string }>;
        };
      }>(
        `mutation VariantUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            userErrors { field message }
          }
        }`,
        {
          productId: product.id,
          variants: variantNodes.map((v) => ({
            id: v.id,
            price: params.price,
            inventoryItem: {
              sku: params.sku,
              tracked: true,
              measurement: {
                weight: { value: DEFAULT_WEIGHT_KG, unit: "KILOGRAMS" },
              },
            },
          })),
        },
      );
      if (updateRes.productVariantsBulkUpdate.userErrors.length) {
        warnings.push(
          `Variant update: ${updateRes.productVariantsBulkUpdate.userErrors.map((e) => e.message).join(", ")}`,
        );
      }

      // Seed inventory at the default location
      try {
        const setQuantitiesRes = await shopifyGraphQL<{
          inventorySetQuantities: {
            userErrors: Array<{ field: string[]; message: string }>;
          };
        }>(
          `mutation InventorySet($input: InventorySetQuantitiesInput!) {
            inventorySetQuantities(input: $input) {
              userErrors { field message }
            }
          }`,
          {
            input: {
              name: "available",
              reason: "correction",
              ignoreCompareQuantity: true,
              quantities: variantNodes.map((v) => ({
                inventoryItemId: v.inventoryItem.id,
                locationId: DEFAULT_LOCATION_ID,
                quantity: initialQty,
              })),
            },
          },
        );
        if (setQuantitiesRes.inventorySetQuantities.userErrors.length) {
          warnings.push(
            `Inventory seed: ${setQuantitiesRes.inventorySetQuantities.userErrors.map((e) => e.message).join(", ")}`,
          );
        }
      } catch (err) {
        warnings.push(err instanceof Error ? `Inventory: ${err.message}` : "Inventory seed failed");
      }
    }
  } catch (err) {
    warnings.push(err instanceof Error ? `Variant: ${err.message}` : "Variant update failed");
  }

  // Set Google Shopping + Facebook metafields + sleeve-length metaobject reference
  try {
    const metaRes = await shopifyGraphQL<{
      metafieldsSet: {
        userErrors: Array<{ field: string[]; message: string }>;
      };
    }>(
      `mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors { field message }
        }
      }`,
      {
        metafields: [
          { ownerId: product.id, namespace: GOOGLE_SHOPPING_NAMESPACE, key: "age_group", type: "single_line_text_field", value: "adult" },
          { ownerId: product.id, namespace: GOOGLE_SHOPPING_NAMESPACE, key: "condition", type: "single_line_text_field", value: "new" },
          { ownerId: product.id, namespace: GOOGLE_SHOPPING_NAMESPACE, key: "gender", type: "single_line_text_field", value: "female" },
          { ownerId: product.id, namespace: GOOGLE_SHOPPING_NAMESPACE, key: "mpn", type: "single_line_text_field", value: params.sku },
          { ownerId: product.id, namespace: "mc-facebook", key: "google_product_category", type: "single_line_text_field", value: "5388" },
          {
            ownerId: product.id,
            namespace: "shopify",
            key: "sleeve-length-type",
            type: "list.metaobject_reference",
            value: JSON.stringify([SLEEVE_LENGTH_LONG_METAOBJECT_GID]),
          },
        ],
      },
    );
    if (metaRes.metafieldsSet.userErrors.length) {
      warnings.push(
        `Metafields: ${metaRes.metafieldsSet.userErrors.map((e) => e.message).join(", ")}`,
      );
    }
  } catch (err) {
    warnings.push(err instanceof Error ? `Metafields: ${err.message}` : "Metafields failed");
  }

  // Set inventory item customs fields (country of origin = KW, harmonized system code) on every variant
  try {
    const invData = await shopifyGraphQL<{
      product: {
        variants: { edges: Array<{ node: { inventoryItem: { id: string } } }> };
      } | null;
    }>(
      `query InventoryItems($id: ID!) {
        product(id: $id) {
          variants(first: 100) { edges { node { inventoryItem { id } } } }
        }
      }`,
      { id: product.id },
    );
    const inventoryItemIds = (invData.product?.variants.edges ?? [])
      .map((e) => e.node.inventoryItem?.id)
      .filter((id): id is string => Boolean(id));
    warnings.push(...(await applyCustomsToInventoryItems(inventoryItemIds)));
  } catch (err) {
    warnings.push(err instanceof Error ? `Customs fields: ${err.message}` : "Customs fields update failed");
  }

  // Add to collections
  if (params.collectionIds.length > 0) {
    await Promise.all(
      params.collectionIds.map(async (cid) => {
        try {
          const res = await shopifyGraphQL<{
            collectionAddProducts: {
              userErrors: Array<{ field: string[]; message: string }>;
            };
          }>(
            `mutation AddToCollection($id: ID!, $productIds: [ID!]!) {
              collectionAddProducts(id: $id, productIds: $productIds) {
                userErrors { field message }
              }
            }`,
            { id: cid, productIds: [product.id] },
          );
          if (res.collectionAddProducts.userErrors.length) {
            warnings.push(
              `Collection ${cid}: ${res.collectionAddProducts.userErrors.map((e) => e.message).join(", ")}`,
            );
          }
        } catch (err) {
          warnings.push(err instanceof Error ? `Collection ${cid}: ${err.message}` : "Collection add failed");
        }
      }),
    );
  }

  // Register Arabic translations
  try {
    const translatable = await shopifyGraphQL<{
      translatableResource: {
        translatableContent: Array<{ key: string; value: string; digest: string; locale: string }>;
      } | null;
    }>(
      `query TranslatableResource($id: ID!) {
        translatableResource(resourceId: $id) {
          translatableContent { key value digest locale }
        }
      }`,
      { id: product.id },
    );

    const digestByKey = new Map<string, string>();
    for (const c of translatable.translatableResource?.translatableContent ?? []) {
      digestByKey.set(c.key, c.digest);
    }

    const translationPlan: Array<{ key: string; value: string }> = [
      { key: "title", value: params.arTitle },
      { key: "body_html", value: paragraphsToHtml(params.arDescription) },
      { key: "meta_title", value: params.arSeoTitle },
      { key: "meta_description", value: params.arSeoDescription },
    ];

    const translations = translationPlan
      .filter((t) => digestByKey.has(t.key))
      .map((t) => ({
        locale: "ar",
        key: t.key,
        value: t.value,
        translatableContentDigest: digestByKey.get(t.key)!,
      }));

    if (translations.length > 0) {
      const trRes = await shopifyGraphQL<{
        translationsRegister: {
          userErrors: Array<{ field: string[]; message: string }>;
        };
      }>(
        `mutation TranslationsRegister($resourceId: ID!, $translations: [TranslationInput!]!) {
          translationsRegister(resourceId: $resourceId, translations: $translations) {
            userErrors { field message }
          }
        }`,
        { resourceId: product.id, translations },
      );
      if (trRes.translationsRegister.userErrors.length) {
        warnings.push(
          `AR translations: ${trRes.translationsRegister.userErrors.map((e) => e.message).join(", ")}`,
        );
      }
    } else {
      warnings.push("AR translations skipped: translatable fields not found");
    }
  } catch (err) {
    warnings.push(err instanceof Error ? `AR: ${err.message}` : "AR translations failed");
  }

  const numericId = product.id.split("/").pop();
  const adminUrl = `https://${SHOPIFY_STORE_URL.replace(/\.myshopify\.com$/, "")}.myshopify.com/admin/products/${numericId}`;

  // Publish to ALL sales channels (Online Store, POS, TikTok, Facebook & Instagram, Google & YouTube, Snapchat Ads, …).
  // Requires read_publications + write_publications scopes.
  try {
    const pubsData = await shopifyGraphQL<{
      publications: { edges: Array<{ node: { id: string; name: string } }> };
    }>(`query AllPublications { publications(first: 50) { edges { node { id name } } } }`);

    const allPubInputs = pubsData.publications.edges.map((e) => ({
      publicationId: e.node.id,
    }));

    if (allPubInputs.length > 0) {
      const pubRes = await shopifyGraphQL<{
        publishablePublish: {
          userErrors: Array<{ field: string[]; message: string }>;
        };
      }>(
        `mutation Publish($id: ID!, $input: [PublicationInput!]!) {
          publishablePublish(id: $id, input: $input) {
            userErrors { field message }
          }
        }`,
        { id: product.id, input: allPubInputs },
      );
      if (pubRes.publishablePublish.userErrors.length) {
        warnings.push(
          `Multi-channel publish: ${pubRes.publishablePublish.userErrors.map((e) => e.message).join(", ")}`,
        );
      }
    } else {
      warnings.push("Multi-channel publish: no publications found");
    }
  } catch (err) {
    // Fallback to REST web-only publish if GraphQL fails (e.g. scope not yet granted).
    warnings.push(
      err instanceof Error
        ? `Multi-channel publish failed, falling back to web-only: ${err.message}`
        : "Multi-channel publish failed, falling back to web-only",
    );
    try {
      const pubRes = await fetch(
        `https://${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/products/${numericId}.json`,
        {
          method: "PUT",
          headers: {
            "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            product: { id: Number(numericId), published: true, published_scope: "web" },
          }),
        },
      );
      if (!pubRes.ok) {
        const text = await pubRes.text();
        warnings.push(`Fallback web publish failed: ${pubRes.status} ${text.slice(0, 200)}`);
      }
    } catch (fallbackErr) {
      warnings.push(
        fallbackErr instanceof Error ? `Fallback publish: ${fallbackErr.message}` : "Fallback publish failed",
      );
    }
  }

  return {
    productId: product.id,
    productHandle: product.handle,
    adminUrl,
    warnings,
  };
}

export interface AddVariantParams {
  productId: string;
  colorName: string;
  price: string;
  sku: string;
  imageBuffer: Buffer;
  imageMimeType: string;
  imageFilename: string;
}

export interface AddVariantResult {
  variantId: string;
  productHandle: string;
  adminUrl: string;
  warnings: string[];
}

export async function addVariantToProduct(
  params: AddVariantParams,
): Promise<AddVariantResult> {
  const warnings: string[] = [];

  // 1. Read product first so we can use title/handle for SEO filename + alt
  const productData = await shopifyGraphQL<{
    product: {
      title: string;
      handle: string;
      options: Array<{ id: string; name: string; values: string[] }>;
    } | null;
  }>(
    `query Product($id: ID!) {
      product(id: $id) {
        title
        handle
        options { id name values }
      }
    }`,
    { id: params.productId },
  );
  if (!productData.product) throw new Error("Produit Shopify introuvable");

  // 2. SEO-friendly filename + alt
  const ext = params.imageFilename.split(".").pop() ?? "png";
  const colorSlug = slugify(params.colorName) || "variant";
  const seoFilename = `${productData.product.handle}-${colorSlug}.${ext}`;
  const seoAlt = `${productData.product.title} — ${params.colorName}`.slice(0, 125);

  // 3. Stage upload + push image
  const staged = await stagedUploadCreate({
    filename: seoFilename,
    mimeType: params.imageMimeType,
    fileSize: params.imageBuffer.length,
  });
  await uploadToStagedTarget(
    staged,
    params.imageBuffer,
    params.imageMimeType,
    seoFilename,
  );

  const colorOption = productData.product.options.find(
    (o) => o.name.toLowerCase() === "color" || o.name.toLowerCase() === "couleur",
  );
  const sizeOption = productData.product.options.find(
    (o) => o.name.toLowerCase() === "size",
  );
  const lengthOption = productData.product.options.find(
    (o) => o.name.toLowerCase() === LENGTH_OPTION_NAME.toLowerCase(),
  );

  if (!sizeOption || !lengthOption) {
    throw new Error(
      "Le produit principal n'a pas les options Size et Length in inch requises",
    );
  }

  const colorOptionName = colorOption?.name ?? "Color";

  // 3. Add Color option (or new color value to existing option)
  if (!colorOption) {
    const optRes = await shopifyGraphQL<{
      productOptionsCreate: {
        userErrors: Array<{ field: string[]; message: string }>;
      };
    }>(
      `mutation OptionsCreate($productId: ID!, $options: [OptionCreateInput!]!) {
        productOptionsCreate(productId: $productId, options: $options) {
          userErrors { field message }
        }
      }`,
      {
        productId: params.productId,
        options: [{ name: "Color", values: [{ name: params.colorName }] }],
      },
    );
    if (optRes.productOptionsCreate.userErrors.length) {
      warnings.push(
        `Color option create: ${optRes.productOptionsCreate.userErrors.map((e) => e.message).join(", ")}`,
      );
    }
  } else if (!colorOption.values.includes(params.colorName)) {
    const updRes = await shopifyGraphQL<{
      productOptionUpdate: {
        userErrors: Array<{ field: string[]; message: string }>;
      };
    }>(
      `mutation OptionUpdate($productId: ID!, $option: OptionUpdateInput!, $optionValuesToAdd: [OptionValueCreateInput!]) {
        productOptionUpdate(productId: $productId, option: $option, optionValuesToAdd: $optionValuesToAdd) {
          userErrors { field message }
        }
      }`,
      {
        productId: params.productId,
        option: { id: colorOption.id },
        optionValuesToAdd: [{ name: params.colorName }],
      },
    );
    if (updRes.productOptionUpdate.userErrors.length) {
      warnings.push(
        `Color option update: ${updRes.productOptionUpdate.userErrors.map((e) => e.message).join(", ")}`,
      );
    }
  }

  // 4. Build cartesian Size × Length variants for the new color
  type VariantInput = {
    optionValues: Array<{ optionName: string; name: string }>;
    price: string;
    inventoryItem: {
      sku: string;
      tracked: boolean;
      measurement: { weight: { value: number; unit: string } };
    };
    mediaSrc?: string[];
  };
  const newVariants: VariantInput[] = [];
  let mediaAttached = false;
  for (const size of sizeOption.values) {
    for (const length of lengthOption.values) {
      const variant: VariantInput = {
        optionValues: [
          { optionName: sizeOption.name, name: size },
          { optionName: lengthOption.name, name: length },
          { optionName: colorOptionName, name: params.colorName },
        ],
        price: params.price,
        inventoryItem: {
          sku: params.sku,
          tracked: true,
          measurement: { weight: { value: DEFAULT_WEIGHT_KG, unit: "KILOGRAMS" } },
        },
      };
      if (!mediaAttached) {
        variant.mediaSrc = [staged.resourceUrl];
        mediaAttached = true;
      }
      newVariants.push(variant);
    }
  }

  const variantRes = await shopifyGraphQL<{
    productVariantsBulkCreate: {
      productVariants: Array<{ id: string; inventoryItem: { id: string } }> | null;
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(
    `mutation VariantCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!, $strategy: ProductVariantsBulkCreateStrategy) {
      productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: $strategy) {
        productVariants { id inventoryItem { id } }
        userErrors { field message }
      }
    }`,
    {
      productId: params.productId,
      strategy: "REMOVE_STANDALONE_VARIANT",
      variants: newVariants,
    },
  );

  if (variantRes.productVariantsBulkCreate.userErrors.length) {
    throw new Error(
      `Variant create: ${variantRes.productVariantsBulkCreate.userErrors
        .map((e) => `${e.field?.join(".")}: ${e.message}`)
        .join(" | ")}`,
    );
  }

  const createdVariants = variantRes.productVariantsBulkCreate.productVariants ?? [];
  if (createdVariants.length === 0) throw new Error("Aucune variante créée");

  // Apply customs (country of origin + HS code) + tracking on every new inventory item
  try {
    const inventoryItemIds = createdVariants
      .map((v) => v.inventoryItem?.id)
      .filter((id): id is string => Boolean(id));
    if (inventoryItemIds.length) {
      warnings.push(...(await applyCustomsToInventoryItems(inventoryItemIds)));
    }
  } catch (err) {
    warnings.push(err instanceof Error ? `Customs fields: ${err.message}` : "Customs fields update failed");
  }

  const numericId = params.productId.split("/").pop();
  const adminUrl = `https://${SHOPIFY_STORE_URL.replace(/\.myshopify\.com$/, "")}.myshopify.com/admin/products/${numericId}`;

  return {
    variantId: createdVariants[0].id,
    productHandle: productData.product.handle,
    adminUrl,
    warnings,
  };
}

export interface AddLengthResult {
  productId: string;
  variantsCreated: number;
  warnings: string[];
  adminUrl: string;
}

const LENGTH_OPTION_NAME = "Length in inch";
const LENGTH_VALUES = [
  "50",
  "51",
  "52",
  "53",
  "54",
  "55",
  "56",
  "57",
  "58",
  "59",
  "60",
];

const LENGTH_VARIANTS_NAME_PATTERNS = ["length", "lenght", "longueur"];

export async function addLengthToProduct(
  productId: string,
): Promise<AddLengthResult> {
  const warnings: string[] = [];

  const productData = await shopifyGraphQL<{
    product: {
      title: string;
      handle: string;
      options: Array<{ id: string; name: string; values: string[] }>;
      variants: {
        edges: Array<{
          node: {
            id: string;
            price: string;
            sku: string | null;
            selectedOptions: Array<{ name: string; value: string }>;
          };
        }>;
      };
    } | null;
  }>(
    `query Product($id: ID!) {
      product(id: $id) {
        title
        handle
        options { id name values }
        variants(first: 100) {
          edges { node {
            id
            price
            sku
            selectedOptions { name value }
          }}
        }
      }
    }`,
    { id: productId },
  );

  if (!productData.product) throw new Error("Produit Shopify introuvable");

  const existingLength = productData.product.options.find((o) =>
    LENGTH_VARIANTS_NAME_PATTERNS.some((p) => o.name.toLowerCase().includes(p)),
  );
  if (existingLength) {
    throw new Error(
      `Ce produit a déjà une option longueur (« ${existingLength.name} »).`,
    );
  }

  const existingVariants = productData.product.variants.edges.map((e) => e.node);

  const optRes = await shopifyGraphQL<{
    productOptionsCreate: {
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(
    `mutation OptionsCreate($productId: ID!, $options: [OptionCreateInput!]!) {
      productOptionsCreate(productId: $productId, options: $options) {
        userErrors { field message }
      }
    }`,
    {
      productId,
      options: [
        {
          name: LENGTH_OPTION_NAME,
          values: [{ name: LENGTH_VALUES[0] }],
        },
      ],
    },
  );

  if (optRes.productOptionsCreate.userErrors.length) {
    throw new Error(
      `Length option create: ${optRes.productOptionsCreate.userErrors.map((e) => e.message).join(", ")}`,
    );
  }

  const newVariants: Array<{
    optionValues: Array<{ optionName: string; name: string }>;
    price: string;
    inventoryItem: { sku: string; tracked: boolean };
  }> = [];

  for (const variant of existingVariants) {
    const otherOptions = variant.selectedOptions.filter(
      (o) => o.name !== LENGTH_OPTION_NAME,
    );
    for (const lv of LENGTH_VALUES.slice(1)) {
      newVariants.push({
        optionValues: [
          ...otherOptions.map((o) => ({ optionName: o.name, name: o.value })),
          { optionName: LENGTH_OPTION_NAME, name: lv },
        ],
        price: variant.price,
        inventoryItem: { sku: variant.sku ?? "", tracked: true },
      });
    }
  }

  if (newVariants.length > 0) {
    const createRes = await shopifyGraphQL<{
      productVariantsBulkCreate: {
        productVariants: Array<{ id: string; inventoryItem: { id: string } | null }> | null;
        userErrors: Array<{ field: string[]; message: string }>;
      };
    }>(
      `mutation VariantCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkCreate(productId: $productId, variants: $variants) {
          productVariants { id inventoryItem { id } }
          userErrors { field message }
        }
      }`,
      { productId, variants: newVariants },
    );

    if (createRes.productVariantsBulkCreate.userErrors.length) {
      warnings.push(
        `Variant create: ${createRes.productVariantsBulkCreate.userErrors.map((e) => e.message).join(", ")}`,
      );
    }

    // Apply customs (country of origin + HS code) on the newly created length variants
    const newInventoryItemIds = (createRes.productVariantsBulkCreate.productVariants ?? [])
      .map((v) => v.inventoryItem?.id)
      .filter((id): id is string => Boolean(id));
    if (newInventoryItemIds.length > 0) {
      warnings.push(...(await applyCustomsToInventoryItems(newInventoryItemIds)));
    }
  }

  const numericId = productId.split("/").pop();
  const adminUrl = `https://${SHOPIFY_STORE_URL.replace(/\.myshopify\.com$/, "")}.myshopify.com/admin/products/${numericId}`;

  return {
    productId,
    variantsCreated: newVariants.length,
    warnings,
    adminUrl,
  };
}
