import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { buildCookie } from "@/lib/http-cookies";

const MAX_AGE_SECONDS = 10 * 60;
const VERSION = "v1";

type OAuthProvider = "shopify" | "meta" | "snapchat";

function getSecret(): string {
  const secret = process.env.DASHBOARD_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("DASHBOARD_SECRET manquant ou trop court pour OAuth state");
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function oauthStateCookieName(provider: OAuthProvider): string {
  return `bm_oauth_${provider}`;
}

export function createOAuthState(provider: OAuthProvider): { state: string; cookie: string } {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const nonce = randomBytes(24).toString("base64url");
  const payload = `${VERSION}.${provider}.${expiresAt}.${nonce}`;
  const state = `${payload}.${sign(payload)}`;
  return {
    state,
    cookie: buildCookie(oauthStateCookieName(provider), state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MAX_AGE_SECONDS,
    }),
  };
}

export function clearOAuthStateCookie(provider: OAuthProvider): string {
  return buildCookie(oauthStateCookieName(provider), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function verifyOAuthState(
  provider: OAuthProvider,
  state: string | null,
  cookieState: string | undefined,
): boolean {
  if (!state || !cookieState) return false;
  const stateBuf = Buffer.from(state);
  const cookieBuf = Buffer.from(cookieState);
  if (stateBuf.length !== cookieBuf.length || !timingSafeEqual(stateBuf, cookieBuf)) {
    return false;
  }

  const parts = state.split(".");
  if (parts.length !== 5) return false;
  const [version, stateProvider, expiresAtStr, nonce, signature] = parts;
  if (version !== VERSION || stateProvider !== provider || !nonce) return false;

  const payload = `${version}.${stateProvider}.${expiresAtStr}.${nonce}`;
  const expected = sign(payload);
  const expectedBuf = Buffer.from(expected);
  const givenBuf = Buffer.from(signature);
  if (expectedBuf.length !== givenBuf.length || !timingSafeEqual(expectedBuf, givenBuf)) {
    return false;
  }

  const expiresAt = Number(expiresAtStr);
  return Number.isFinite(expiresAt) && expiresAt >= Date.now();
}
