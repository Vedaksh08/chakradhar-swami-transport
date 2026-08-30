import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True once real Supabase keys are present in the environment. */
export const supabaseConfigured = Boolean(
  url && key && !url.includes("YOUR-PROJECT") && !key.includes("YOUR-ANON-KEY")
);

let client: SupabaseClient | null = null;

/**
 * Browser client. Uses cookie storage (not localStorage) so the session is
 * visible to middleware and the login gate can run at the edge.
 */
export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  if (!client) client = createBrowserClient(url!, key!);
  return client;
}
