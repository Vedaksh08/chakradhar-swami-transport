import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * True once the service-role key is present. Creating and deleting sign-in
 * accounts is an admin operation, so it can only ever happen here on the
 * server — the key must never reach the browser bundle, which is why it is
 * deliberately not prefixed NEXT_PUBLIC_.
 */
export const adminConfigured = Boolean(url && serviceKey);

/** Reads the caller's session from their cookies. Never elevated. */
export function callerClient(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  const jar = cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => jar.getAll(),
      // Route handlers here only read the session; refreshing it is the
      // middleware's job.
      setAll: () => {},
    },
  });
}

/** Full-privilege client. Bypasses RLS — only ever use it behind an owner check. */
export function adminClient(): SupabaseClient | null {
  if (!adminConfigured) return null;
  return createClient(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
