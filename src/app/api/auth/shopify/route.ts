import { NextResponse } from "next/server";

// Step 1: Redirect to Shopify OAuth page
export async function GET() {
  const shop = process.env.SHOPIFY_STORE_URL!;
  const clientId = process.env.SHOPIFY_CLIENT_ID!;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/shopify/callback`;
  const scopes = "read_all_orders,read_analytics,read_customers,write_customers,read_inventory,write_inventory,read_orders,write_orders,read_products,write_products,read_content,write_content,read_translations,write_translations,read_locales";

  const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}`;

  return NextResponse.redirect(authUrl);
}
