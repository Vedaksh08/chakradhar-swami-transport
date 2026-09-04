import type { Permission } from "./types";

/**
 * Staff sign in with a plain username, not an email — but Supabase Auth is
 * built around emails. Each account therefore gets a synthetic address built
 * from its username, which is what actually goes to Supabase. Nothing is ever
 * sent to it; it only has to be unique and well-formed.
 *
 * This has to stay stable: change it and every existing staff login breaks.
 */
export const STAFF_EMAIL_DOMAIN = "staff.cstransport.in";

export function staffEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${STAFF_EMAIL_DOMAIN}`;
}

/** True for anything that looks like an email rather than a username. */
export function looksLikeEmail(value: string): boolean {
  return value.includes("@");
}

/** What the login box was given, turned into the address Supabase expects. */
export function toLoginEmail(idOrEmail: string): string {
  const v = idOrEmail.trim();
  return looksLikeEmail(v) ? v : staffEmail(v);
}

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;

/** Null when fine, otherwise the reason to show. */
export function validateUsername(username: string): string | null {
  const v = username.trim().toLowerCase();
  if (!v) return "Pick a login ID.";
  if (!USERNAME_RE.test(v)) {
    return "3–32 characters: letters, numbers, dot, dash or underscore.";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 6) return "Use at least 6 characters.";
  return null;
}

export function isPermission(v: unknown): v is Permission {
  return (
    typeof v === "string" &&
    ["entries", "invoices", "vehicles", "drivers", "companies", "parties", "reports", "settings"].includes(
      v
    )
  );
}
