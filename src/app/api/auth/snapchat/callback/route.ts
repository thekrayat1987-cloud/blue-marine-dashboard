import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Missing code parameter" }, { status: 400 });
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

    // Save token
    try {
      const envPath = join(process.cwd(), ".env.local");
      let envContent = readFileSync(envPath, "utf-8");
      envContent = envContent.replace(/SNAP_ACCESS_TOKEN=.*/, `SNAP_ACCESS_TOKEN=${accessToken}`);
      writeFileSync(envPath, envContent);
    } catch { /* */ }

    process.env.SNAP_ACCESS_TOKEN = accessToken;

    return NextResponse.redirect(new URL("/snapchat?connected=true", request.url));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
