import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIntegrationAccessToken } from "@/lib/integration-tokens";

export const dynamic = "force-dynamic";

async function getShopifyConfig(): Promise<{ endpoint: string; token: string }> {
  const store = process.env.SHOPIFY_STORE_URL;
  const token = await getIntegrationAccessToken("shopify", "SHOPIFY_ACCESS_TOKEN");
  const version = process.env.SHOPIFY_API_VERSION || "2024-10";
  if (!store || !token) throw new Error("SHOPIFY_STORE_URL or SHOPIFY_ACCESS_TOKEN missing");
  return { endpoint: `https://${store}/admin/api/${version}/graphql.json`, token };
}

interface ArchivedProduct {
  id: string;
  handle: string;
  title: string;
  productType: string | null;
}

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const cfg = await getShopifyConfig();
  const r = await fetch(cfg.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": cfg.token },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data as T;
}

function pickTarget(productType: string | null, handle: string): string {
  const t = (productType || "").toLowerCase();
  if (t === "three-piece daraa") return "/collections/3-piece-daraa-set";
  if (t === "two-piece daraa") return "/collections/2-piece-set-daraa";
  if (t === "bisht set" && handle.includes("3-piece")) return "/collections/3-piece-daraa-set";
  if (t === "bisht set" && handle.includes("2-piece")) return "/collections/2-piece-set-daraa";
  if (t === "bisht set" || t === "bisht") return "/collections/3-piece-daraa-set";
  if (t === "caftan") return "/collections/one-piece-daraa";
  if (t === "fragrance") return "/collections/eau-de-parfum";
  return "/collections/one-piece-daraa";
}

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization") || "";
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const archived: ArchivedProduct[] = [];
  let after: string | null = null;
  while (true) {
    const d: { products: { edges: { node: ArchivedProduct }[]; pageInfo: { hasNextPage: boolean; endCursor: string } } } =
      await gql(
        `query($after:String){
          products(first:50, after:$after, query:"status:archived"){
            edges{ node{ id handle title productType } }
            pageInfo{ hasNextPage endCursor }
          }
        }`,
        { after },
      );
    for (const e of d.products.edges) archived.push(e.node);
    if (!d.products.pageInfo.hasNextPage) break;
    after = d.products.pageInfo.endCursor;
  }

  const created: { handle: string; path: string; target: string }[] = [];
  const skipped: string[] = [];
  const errors: { handle: string; error: string }[] = [];

  for (const p of archived) {
    const path = `/products/${p.handle}`;
    const target = pickTarget(p.productType, p.handle);

    const existing: { urlRedirects: { edges: { node: { path: string } }[] } } = await gql(
      `query($q:String){ urlRedirects(first:5, query:$q){ edges{ node{ id path target } } } }`,
      { q: `path:${path}` },
    );
    if (existing.urlRedirects.edges.find((e) => e.node.path === path)) {
      skipped.push(p.handle);
      continue;
    }

    const d: {
      urlRedirectCreate: { urlRedirect: { id: string } | null; userErrors: { field: string[]; message: string }[] };
    } = await gql(
      `mutation($input: UrlRedirectInput!){
        urlRedirectCreate(urlRedirect: $input){ urlRedirect{ id path target } userErrors{ field message } }
      }`,
      { input: { path, target } },
    );
    const errs = d.urlRedirectCreate.userErrors;
    if (errs.length) {
      errors.push({ handle: p.handle, error: errs.map((e) => e.message).join("; ") });
    } else {
      created.push({ handle: p.handle, path, target });
    }
  }

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    archivedCount: archived.length,
    created,
    skipped: skipped.length,
    errors,
  });
}
