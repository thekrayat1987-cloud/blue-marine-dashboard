import { NextResponse } from "next/server";
import { createOAuthState } from "@/lib/oauth-state";

// Step 1: Redirect to Shopify OAuth page
export async function GET() {
  const shop = process.env.SHOPIFY_STORE_URL!;
  const clientId = process.env.SHOPIFY_CLIENT_ID!;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/shopify/callback`;
  const { state, cookie } = createOAuthState("shopify");
  const scopes = [
    "read_orders",
    "read_all_orders",
    "read_customers",
    "read_products",
    "write_products",
    "read_inventory",
    "write_inventory",
    "read_files",
    "write_files",
    "read_content",
    "write_content",
    "read_discounts",
    "write_discounts",
    "read_publications",
    "write_publications",
    "read_translations",
    "write_translations",
    "read_themes",
    "write_themes",
    "read_online_store_navigation",
    "write_online_store_navigation",
    "read_markets",
  ].join(",");

  const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;

  const response = NextResponse.redirect(authUrl);
  response.headers.append("Set-Cookie", cookie);
  return response;
}
