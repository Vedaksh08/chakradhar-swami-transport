import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/api-auth";
import { isPermission, staffEmail, validatePassword, validateUsername } from "@/lib/users";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/**
 * Change a staff account: their name, what they can reach, whether they're
 * still active, and — the point of keeping this server-side — their login ID
 * and password, which only the owner can ever set.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.res;
  const { admin, userId } = gate;
  const id = params.id;

  const { data: existing } = await admin
    .from("app_users")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "No such user." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};

  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.active === "boolean") patch.active = body.active;
  if (body.role === "owner" || body.role === "staff") patch.role = body.role;
  if (Array.isArray(body.permissions)) patch.permissions = body.permissions.filter(isPermission);
  if (patch.role === "owner") patch.permissions = [];

  // An owner locking or demoting themselves would leave nobody able to hand
  // access back out.
  if (id === userId && (patch.active === false || patch.role === "staff")) {
    return NextResponse.json(
      { error: "You can't lock yourself out of your own account." },
      { status: 400 }
    );
  }

  const nextUsername =
    typeof body.username === "string" && body.username.trim().toLowerCase() !== existing.username
      ? body.username.trim().toLowerCase()
      : null;

  if (nextUsername) {
    const bad = validateUsername(nextUsername);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
    const { data: taken } = await admin
      .from("app_users")
      .select("id")
      .eq("username", nextUsername)
      .maybeSingle();
    if (taken) {
      return NextResponse.json({ error: "That login ID is already taken." }, { status: 409 });
    }
    patch.username = nextUsername;
  }

  const password = typeof body.password === "string" && body.password ? body.password : null;
  if (password) {
    const bad = validatePassword(password);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  }

  // The sign-in account carries the credentials; app_users carries the rest.
  if (password || nextUsername) {
    const { error } = await admin.auth.admin.updateUserById(id, {
      ...(password ? { password } : {}),
      ...(nextUsername ? { email: staffEmail(nextUsername) } : {}),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (Object.keys(patch).length) {
    const { error } = await admin.from("app_users").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data: updated } = await admin.from("app_users").select("*").eq("id", id).maybeSingle();
  return NextResponse.json({ user: updated });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.res;
  const { admin, userId } = gate;

  if (params.id === userId) {
    return NextResponse.json({ error: "You can't delete your own account." }, { status: 400 });
  }

  // The app_users row goes with it — the foreign key cascades from auth.users.
  const { error } = await admin.auth.admin.deleteUser(params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from("app_users").delete().eq("id", params.id);
  return NextResponse.json({ ok: true });
}
