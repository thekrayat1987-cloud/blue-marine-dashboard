import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { supabase } from "@/lib/supabase";

export type IntegrationProvider = "shopify" | "meta" | "snapchat";

type TokenRow = {
  provider: IntegrationProvider;
  access_token_ciphertext: string;
  token_type: string | null;
  expires_at: string | null;
  metadata: Record<string, unknown> | null;
};

function encryptionKey(): Buffer {
  const secret = process.env.DASHBOARD_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("DASHBOARD_SECRET manquant ou trop court pour chiffrer les tokens");
  }
  return createHash("sha256").update(secret).digest();
}

function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptToken(value: string): string {
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error("Token chiffré invalide");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export async function saveIntegrationToken(params: {
  provider: IntegrationProvider;
  accessToken: string;
  tokenType?: string | null;
  expiresAt?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  const { error } = await supabase.from("integration_tokens").upsert(
    {
      provider: params.provider,
      access_token_ciphertext: encryptToken(params.accessToken),
      token_type: params.tokenType ?? null,
      expires_at: params.expiresAt ?? null,
      metadata: params.metadata ?? {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider" },
  );
  if (error) throw new Error(`Token storage failed: ${error.message}`);
}

export async function getStoredIntegrationToken(
  provider: IntegrationProvider,
): Promise<{ accessToken: string; row: TokenRow } | null> {
  const { data, error } = await supabase
    .from("integration_tokens")
    .select("provider,access_token_ciphertext,token_type,expires_at,metadata")
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw new Error(`Token lookup failed: ${error.message}`);
  if (!data?.access_token_ciphertext) return null;
  const row = data as TokenRow;
  return { accessToken: decryptToken(row.access_token_ciphertext), row };
}

export async function getIntegrationAccessToken(
  provider: IntegrationProvider,
  fallbackEnvName: string,
): Promise<string | null> {
  try {
    const stored = await getStoredIntegrationToken(provider);
    if (stored?.accessToken) return stored.accessToken;
  } catch (error) {
    console.warn(
      `[integration-tokens] ${provider} token lookup failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
  return process.env[fallbackEnvName] || null;
}
