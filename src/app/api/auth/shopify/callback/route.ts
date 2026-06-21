import { NextRequest, NextResponse } from "next/server";
import {
  clearOAuthStateCookie,
  oauthStateCookieName,
  verifyOAuthState,
} from "@/lib/oauth-state";

function normalizeShopHost(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return trimmed.toLowerCase();
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const shop = request.nextUrl.searchParams.get("shop");
  const state = request.nextUrl.searchParams.get("state");
  const cookieState = request.cookies.get(oauthStateCookieName("shopify"))?.value;

  if (!code || !shop) {
    return NextResponse.json({ error: "Missing code or shop parameter" }, { status: 400 });
  }
  if (!verifyOAuthState("shopify", state, cookieState)) {
    return NextResponse.json({ error: "Invalid OAuth state" }, { status: 401 });
  }

  const configuredShop = normalizeShopHost(process.env.SHOPIFY_STORE_URL);
  const callbackShop = normalizeShopHost(shop);
  if (!configuredShop || callbackShop !== configuredShop) {
    return NextResponse.json({ error: "Invalid Shopify shop" }, { status: 400 });
  }

  try {
    const tokenResponse = await fetch(`https://${configuredShop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
        code,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return NextResponse.json({ error: `Token exchange failed: ${errorText}` }, { status: 500 });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token as string;
    if (!accessToken) {
      return NextResponse.json({ error: "Token response missing access_token" }, { status: 500 });
    }

    process.env.SHOPIFY_ACCESS_TOKEN = accessToken;

    const response = NextResponse.redirect(new URL("/settings?shopify_connected=session", request.url));
    response.headers.append("Set-Cookie", clearOAuthStateCookie("shopify"));
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
