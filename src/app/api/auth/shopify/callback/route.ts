import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";

// Step 2: Exchange code for access token
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const shop = request.nextUrl.searchParams.get("shop");

  if (!code || !shop) {
    return NextResponse.json({ error: "Missing code or shop parameter" }, { status: 400 });
  }

  try {
    // Exchange authorization code for access token
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
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
    const accessToken = tokenData.access_token;

    // Save the token to .env.local
    try {
      const envPath = join(process.cwd(), ".env.local");
      let envContent = readFileSync(envPath, "utf-8");
      envContent = envContent.replace(
        /SHOPIFY_ACCESS_TOKEN=.*/,
        `SHOPIFY_ACCESS_TOKEN=${accessToken}`
      );
      writeFileSync(envPath, envContent);
    } catch {
      // File write may fail in some environments
    }

    // Store token in memory for immediate use
    process.env.SHOPIFY_ACCESS_TOKEN = accessToken;

    // Redirect to dashboard with success message
    return NextResponse.redirect(new URL("/?shopify=connected", request.url));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
