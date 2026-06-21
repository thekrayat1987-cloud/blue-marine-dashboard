import { NextResponse } from "next/server";
import { createOAuthState } from "@/lib/oauth-state";

export async function GET() {
  const appId = process.env.META_APP_ID!;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/meta/callback`;
  const { state, cookie } = createOAuthState("meta");

  const scope = [
    "ads_read",
    "ads_management",
    "instagram_basic",
    "instagram_manage_insights",
    "pages_show_list",
    "pages_read_engagement",
  ].join(",");

  const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scope);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);

  const response = NextResponse.redirect(url);
  response.headers.append("Set-Cookie", cookie);
  return response;
}
