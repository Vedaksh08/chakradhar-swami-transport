import { NextResponse } from "next/server";
import { requireOwner, SETUP_HINT } from "@/lib/api-auth";
import { adminConfigured } from "@/lib/supabase-server";
import { isPermission, staffEmail, validatePassword, validateUsername } from "@/lib/users";

export const dynamic = "force-dynamic";

function cleanPermissions(input: unknown): string[] {
  return Array.isArray(input) ? input.filter(isPermission) : [];
}

/** Whether this deployment can create accounts at all, so the UI can say so up front. */
export async function GET() {
  return NextResponse.json({ adminConfigured, hint: adminConfigured ? null : SETUP_HINT });
}

export async function POST(req: Request) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.res;
  const { admin } = gate;

  const body = await req.json().catch(() => ({}));
  const username = String(body.username ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim();
  const password = String(body.password ?? "");
  const role = body.role === "owner" ? "owner" : "staff";
  const permissions = role === "owner" ? [] : cleanPermissions(body.permissions);

  const bad =
    validateUsername(username) ?? validatePassword(password) ?? (name ? null : "Add a name.");
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });

  const { data: taken } = await admin
    .from("app_users")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (taken) {
    return NextResponse.json({ error: "That login ID is already taken." }, { status: 409 });
  }

  // Confirmed on creation: there is no inbox behind a staff address, so an
  // unconfirmed account could never sign in.
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: staffEmail(username),
    password,
    email_confirm: true,
    user_metadata: { name, username },
  });
  if (authError || !created?.user) {
    return NextResponse.json(
      { error: authError?.message ?? "Could not create the sign-in account." },
      { status: 400 }
    );
  }

  const row = {
    id: created.user.id,
    username,
    name,
    role,
    permissions,
    active: true,
    createdAt: new Date().toISOString(),
  };

  const { error: rowError } = await admin.from("app_users").insert(row);
  if (rowError) {
    // Don't leave an auth account behind that the app knows nothing about.
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: rowError.message }, { status: 400 });
  }

  return NextResponse.json({ user: row });
}
