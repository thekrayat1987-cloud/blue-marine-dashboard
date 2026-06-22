import { NextRequest } from "next/server";
import {
  AUTH_COOKIE_NAME,
  checkPassword,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth";
import { buildCookie } from "@/lib/http-cookies";
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  recordFailedLoginAttempt,
} from "@/lib/login-rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const key = rateLimitKey(request);
    const limit = await checkLoginRateLimit(key);
    if (!limit.allowed) {
      return Response.json(
        { error: "Trop de tentatives. Réessaie dans quelques minutes." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
        },
      );
    }

    const body = await request.json().catch(() => ({}));
    const password = typeof body.password === "string" ? body.password : "";

    if (!checkPassword(password)) {
      await recordFailedLoginAttempt(key);
      return Response.json({ error: "Mot de passe incorrect" }, { status: 401 });
    }

    await clearLoginRateLimit(key);
    const token = createSessionToken();
    const response = Response.json({ ok: true });
    response.headers.append(
      "Set-Cookie",
      buildCookie(AUTH_COOKIE_NAME, token, sessionCookieOptions),
    );
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}

function rateLimitKey(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "unknown";
}
