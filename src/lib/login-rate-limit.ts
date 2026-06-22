import { createHash } from "crypto";
import { supabase } from "@/lib/supabase";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const fallbackAttempts = new Map<string, { count: number; resetAt: number }>();

function hashKey(key: string): string {
  const pepper = process.env.DASHBOARD_SECRET || "blue-marine-dashboard";
  return createHash("sha256").update(`${pepper}:${key}`).digest("hex");
}

export async function checkLoginRateLimit(
  key: string,
): Promise<{ allowed: true } | { allowed: false; retryAfterMs: number }> {
  const now = Date.now();
  const keyHash = hashKey(key);
  try {
    const { data, error } = await supabase
      .from("login_rate_limits")
      .select("attempt_count,reset_at")
      .eq("key_hash", keyHash)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { allowed: true };
    const resetAt = new Date(data.reset_at).getTime();
    if (!Number.isFinite(resetAt) || resetAt <= now) return { allowed: true };
    if (Number(data.attempt_count) < MAX_ATTEMPTS) return { allowed: true };
    return { allowed: false, retryAfterMs: resetAt - now };
  } catch (error) {
    console.warn(
      `[login-rate-limit] persistent check failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    return checkFallback(key, now);
  }
}

export async function recordFailedLoginAttempt(key: string): Promise<void> {
  const now = Date.now();
  const keyHash = hashKey(key);
  try {
    const { data } = await supabase
      .from("login_rate_limits")
      .select("attempt_count,reset_at")
      .eq("key_hash", keyHash)
      .maybeSingle();
    const resetAt = data?.reset_at ? new Date(data.reset_at).getTime() : 0;
    const nextCount = resetAt > now ? Number(data?.attempt_count || 0) + 1 : 1;
    const nextResetAt = resetAt > now ? new Date(resetAt) : new Date(now + WINDOW_MS);
    const { error } = await supabase.from("login_rate_limits").upsert(
      {
        key_hash: keyHash,
        attempt_count: nextCount,
        reset_at: nextResetAt.toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key_hash" },
    );
    if (error) throw error;
  } catch (error) {
    console.warn(
      `[login-rate-limit] persistent record failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    recordFallback(key, now);
  }
}

export async function clearLoginRateLimit(key: string): Promise<void> {
  const keyHash = hashKey(key);
  fallbackAttempts.delete(key);
  try {
    await supabase.from("login_rate_limits").delete().eq("key_hash", keyHash);
  } catch {
    // ignore; successful login should not fail because cleanup failed
  }
}

function checkFallback(
  key: string,
  now: number,
): { allowed: true } | { allowed: false; retryAfterMs: number } {
  const entry = fallbackAttempts.get(key);
  if (!entry || entry.resetAt <= now) return { allowed: true };
  if (entry.count < MAX_ATTEMPTS) return { allowed: true };
  return { allowed: false, retryAfterMs: entry.resetAt - now };
}

function recordFallback(key: string, now: number) {
  const entry = fallbackAttempts.get(key);
  if (!entry || entry.resetAt <= now) {
    fallbackAttempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
}
