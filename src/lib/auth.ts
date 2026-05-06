import { createHmac, timingSafeEqual } from "crypto";

export const AUTH_COOKIE_NAME = "bm_session";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function getSecret(): string {
  const secret = process.env.DASHBOARD_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "DASHBOARD_SECRET manquant ou trop court (min. 16 caractères) dans .env.local",
    );
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function createSessionToken(): string {
  const expiresAt = Date.now() + COOKIE_MAX_AGE_SECONDS * 1000;
  const payload = `v1.${expiresAt}`;
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [version, expiresAtStr, signature] = parts;
  if (version !== "v1") return false;

  const expected = sign(`${version}.${expiresAtStr}`);
  const expectedBuf = Buffer.from(expected);
  const givenBuf = Buffer.from(signature);
  if (expectedBuf.length !== givenBuf.length) return false;
  if (!timingSafeEqual(expectedBuf, givenBuf)) return false;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  return true;
}

export function checkPassword(password: string | undefined): boolean {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) {
    throw new Error("DASHBOARD_PASSWORD manquant dans .env.local");
  }
  if (!password) return false;
  const expectedBuf = Buffer.from(expected);
  const givenBuf = Buffer.from(password);
  if (expectedBuf.length !== givenBuf.length) return false;
  return timingSafeEqual(expectedBuf, givenBuf);
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: COOKIE_MAX_AGE_SECONDS,
};
