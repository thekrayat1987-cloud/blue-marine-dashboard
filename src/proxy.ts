import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

const PUBLIC_PATHS = new Set<string>([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/shopify",
  "/api/auth/shopify/callback",
  "/api/auth/meta/callback",
  "/api/auth/snapchat/callback",
  "/api/webhooks/shopify/products",
  "/api/webhooks/shopify/collections",
  "/api/webhooks/shopify/orders",
  "/api/cron/sync-archived-redirects",
  "/api/cron/process-pending-upsells",
]);

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (verifySessionToken(token)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Non authentifié" },
      { status: 401 },
    );
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") {
    loginUrl.searchParams.set("next", pathname + search);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};
