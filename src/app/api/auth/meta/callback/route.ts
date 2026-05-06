import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      new URL(`/settings?meta_error=${encodeURIComponent(error || "no_code")}`, request.url)
    );
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

  // Update .env.local
  const envPath = path.join(process.cwd(), ".env.local");
  let envContent = fs.readFileSync(envPath, "utf-8");
  envContent = envContent.replace(
    /^META_ACCESS_TOKEN=.*$/m,
    `META_ACCESS_TOKEN=${finalToken}`
  );
  fs.writeFileSync(envPath, envContent);

  return NextResponse.redirect(new URL("/settings?meta_connected=1", request.url));
}
