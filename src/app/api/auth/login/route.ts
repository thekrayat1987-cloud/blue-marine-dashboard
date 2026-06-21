import { NextRequest } from "next/server";
import {
  AUTH_COOKIE_NAME,
  checkPassword,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth";
import { buildCookie } from "@/lib/http-cookies";

export const runtime = "nodejs";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: NextRequest) {
  try {
    const key = rateLimitKey(request);
    const limit = checkRateLimit(key);
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
      recordFailedAttempt(key);
      return Response.json({ error: "Mot de passe incorrect" }, { status: 401 });
    }

    attempts.delete(key);
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

function checkRateLimit(key: string): { allowed: true } | { allowed: false; retryAfterMs: number } {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) return { allowed: true };
  if (entry.count < MAX_ATTEMPTS) return { allowed: true };
  return { allowed: false, retryAfterMs: entry.resetAt - now };
}

function recordFailedAttempt(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
}
