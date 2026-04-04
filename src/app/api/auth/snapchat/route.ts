import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.SNAP_CLIENT_ID!;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/snapchat/callback`;
  const scope = "snapchat-marketing-api";

  const authUrl = `https://accounts.snapchat.com/login/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}`;

  return NextResponse.redirect(authUrl);
}
