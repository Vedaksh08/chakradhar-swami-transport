import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True once real Supabase keys are present in .env.local. */
export const supabaseConfigured = Boolean(
  url && key && !url.includes("YOUR-PROJECT") && !key.includes("YOUR-ANON-KEY")
);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  if (!client) client = createClient(url!, key!);
  return client;
}
