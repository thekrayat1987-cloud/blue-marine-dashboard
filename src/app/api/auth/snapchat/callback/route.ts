import { NextRequest, NextResponse } from "next/server";
import {
  clearOAuthStateCookie,
  oauthStateCookieName,
  verifyOAuthState,
} from "@/lib/oauth-state";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!code) {
    return NextResponse.json({ error: "Missing code parameter" }, { status: 400 });
  }
  if (!verifyOAuthState("snapchat", state, request.cookies.get(oauthStateCookieName("snapchat"))?.value)) {
    return NextResponse.redirect(new URL("/snapchat?error=invalid_state", request.url));
  }

  try {
    const tokenResponse = await fetch("https://accounts.snapchat.com/login/oauth2/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.SNAP_CLIENT_ID!,
        client_secret: process.env.SNAP_CLIENT_SECRET!,
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/snapchat/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return NextResponse.json({ error: `Token exchange failed: ${errorText}` }, { status: 500 });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return NextResponse.json({ error: "Token response missing access_token" }, { status: 500 });
    }

    process.env.SNAP_ACCESS_TOKEN = accessToken;

    const response = NextResponse.redirect(new URL("/snapchat?connected=session", request.url));
    response.headers.append("Set-Cookie", clearOAuthStateCookie("snapchat"));
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
