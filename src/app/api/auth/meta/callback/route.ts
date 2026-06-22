import { NextRequest, NextResponse } from "next/server";
import {
  clearOAuthStateCookie,
  oauthStateCookieName,
  verifyOAuthState,
} from "@/lib/oauth-state";
import { saveIntegrationToken } from "@/lib/integration-tokens";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state");

  if (error || !code) {
    return NextResponse.redirect(
      new URL(`/settings?meta_error=${encodeURIComponent(error || "no_code")}`, request.url)
    );
  }
  if (!verifyOAuthState("meta", state, request.cookies.get(oauthStateCookieName("meta"))?.value)) {
    return NextResponse.redirect(new URL("/settings?meta_error=invalid_state", request.url));
  }

  const appId = process.env.META_APP_ID!;
  const appSecret = process.env.META_APP_SECRET!;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/meta/callback`;

  // Exchange code for short-lived token
  const tokenRes = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`
  );
  const tokenData = await tokenRes.json();

  if (tokenData.error || !tokenData.access_token) {
    return NextResponse.redirect(
      new URL(`/settings?meta_error=${encodeURIComponent(tokenData.error?.message || "token_exchange_failed")}`, request.url)
    );
  }

  // Exchange for long-lived token (60 days)
  const longTokenRes = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`
  );
  const longTokenData = await longTokenRes.json();
  const finalToken = longTokenData.access_token || tokenData.access_token;
  const expiresIn = Number(longTokenData.expires_in || tokenData.expires_in || 0);

  await saveIntegrationToken({
    provider: "meta",
    accessToken: finalToken,
    tokenType: longTokenData.token_type || tokenData.token_type || "bearer",
    expiresAt: expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    metadata: {
      source: longTokenData.access_token ? "long_lived" : "short_lived",
    },
  });

  const response = NextResponse.redirect(new URL("/settings?meta_connected=stored", request.url));
  response.headers.append("Set-Cookie", clearOAuthStateCookie("meta"));
  return response;
}
