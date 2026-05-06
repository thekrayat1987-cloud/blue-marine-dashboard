import { NextRequest } from "next/server";
import {
  AUTH_COOKIE_NAME,
  checkPassword,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const password = typeof body.password === "string" ? body.password : "";

    if (!checkPassword(password)) {
      return Response.json({ error: "Mot de passe incorrect" }, { status: 401 });
    }

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

function buildCookie(
  name: string,
  value: string,
  options: typeof sessionCookieOptions,
): string {
  const parts = [`${name}=${value}`];
  if (options.maxAge) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) parts.push(`SameSite=${capitalize(options.sameSite)}`);
  return parts.join("; ");
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
