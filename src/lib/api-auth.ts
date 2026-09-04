import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, callerClient } from "./supabase-server";

export const SETUP_HINT =
  "Add SUPABASE_SERVICE_ROLE_KEY to the server environment (Vercel → Settings → " +
  "Environment Variables, or .env.local for local runs), then redeploy. " +
  "Find it in Supabase → Project Settings → API → service_role.";

export type OwnerGate =
  | { ok: true; admin: SupabaseClient; userId: string }
  | { ok: false; res: NextResponse };

/**
 * Only the owner may hand out access.
 *
 * An account with no `app_users` row is the original owner — the one created
 * by hand in the Supabase dashboard before this screen existed — so it keeps
 * full rights rather than being locked out by its own missing record.
 */
export async function requireOwner(): Promise<OwnerGate> {
  const caller = callerClient();
  if (!caller) {
    return {
      ok: false,
      res: NextResponse.json({ error: "No Supabase backend is configured." }, { status: 501 }),
    };
  }

  const {
    data: { user },
  } = await caller.auth.getUser();
  if (!user) {
    return { ok: false, res: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  }

  const admin = adminClient();
  if (!admin) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: `Server not set up for user accounts. ${SETUP_HINT}` },
        { status: 501 }
      ),
    };
  }

  const { data: row } = await admin
    .from("app_users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (row && row.role !== "owner") {
    return {
      ok: false,
      res: NextResponse.json({ error: "Only the owner can manage users." }, { status: 403 }),
    };
  }

  return { ok: true, admin, userId: user.id };
}
