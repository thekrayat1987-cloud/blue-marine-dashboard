import { createClient } from "@supabase/supabase-js";

let cachedClient: ReturnType<typeof createClient> | null = null;

function getSupabaseClient(): ReturnType<typeof createClient> {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL and Supabase API key");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      "SUPABASE_SERVICE_ROLE_KEY is missing; falling back to anon key. Add the service-role key before applying RLS hardening.",
    );
  }

  cachedClient = createClient(url, key, {
    auth: { persistSession: false },
  });
  return cachedClient;
}

// The project does not yet generate Supabase database types, so keep this
// wrapper loose while enforcing server-only service-role initialization.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: any = new Proxy({}, {
  get(_target, prop, receiver) {
    const value = Reflect.get(getSupabaseClient(), prop, receiver);
    return typeof value === "function" ? value.bind(getSupabaseClient()) : value;
  },
});
