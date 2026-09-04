"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  ClipboardList,
  FileText,
  Users,
  Building2,
  Landmark,
  Settings,
  Menu,
  X,
  Truck,
  Database,
  HardDrive,
  LogOut,
  BarChart3,
  ShieldCheck,
  Lock,
} from "lucide-react";
import type { Permission } from "@/lib/types";
import { useStore } from "@/lib/store";
import { useAccess } from "@/lib/access";
import { getSupabase } from "@/lib/supabase";
import { cx } from "./ui";

/**
 * `perm` is the access right a staff account needs to see the tab.
 * `ownerOnly` items are never handed out: the dashboard is the income
 * summary, and the users screen is where access itself is granted.
 */
const NAV: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  perm?: Permission;
  ownerOnly?: boolean;
}[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, ownerOnly: true },
  { href: "/entries", label: "Entries", icon: ClipboardList, perm: "entries" },
  { href: "/invoices", label: "Invoices", icon: FileText, perm: "invoices" },
  { href: "/vehicles", label: "Vehicles", icon: Truck, perm: "vehicles" },
  { href: "/drivers", label: "Drivers", icon: Users, perm: "drivers" },
  { href: "/companies", label: "Companies", icon: Landmark, perm: "companies" },
  { href: "/parties", label: "Parties", icon: Building2, perm: "parties" },
  { href: "/reports", label: "Reports", icon: BarChart3, perm: "reports" },
  { href: "/users", label: "Users", icon: ShieldCheck, ownerOnly: true },
  { href: "/settings", label: "Settings", icon: Settings, perm: "settings" },
];

/** The five that fit the phone tab bar. */
const MOBILE_NAV = ["/", "/entries", "/invoices", "/vehicles", "/reports"];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const { company, backend, ready, error } = useStore();
  const access = useAccess();

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setSignedInAs(data.user?.email ?? null));
  }, [pathname]);

  const allowed = access.locked
    ? []
    : NAV.filter((n) => (n.ownerOnly ? access.isOwner : !n.perm || access.can(n.perm)));

  /** The tab a restricted account lands on when it opens the app. */
  const home = allowed[0]?.href ?? "/entries";

  // The login and print screens sit outside the app chrome entirely — guarding
  // them would bounce a signed-out visitor between here and the login page.
  const standalone = pathname === "/login" || Boolean(pathname?.includes("/print"));

  const permitted =
    !access.ready ||
    standalone ||
    allowed.some((n) => (n.href === "/" ? pathname === "/" : pathname?.startsWith(n.href)));

  // Send a restricted account straight to something it can actually open,
  // rather than parking it on a wall.
  useEffect(() => {
    if (access.ready && !permitted && !access.locked && pathname !== home) router.replace(home);
  }, [access.ready, permitted, access.locked, pathname, home, router]);

  async function signOut() {
    await getSupabase()?.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  // Print views and the login screen render standalone, with no app chrome.
  if (standalone) return <>{children}</>;

  if (access.locked) return <LockedOut onSignOut={signOut} />;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname?.startsWith(href);

  const nav = (
    <nav className="flex flex-col gap-1 p-3">
      {allowed.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={() => setOpen(false)}
          className={cx(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition",
            isActive(href)
              ? "bg-white/10 text-white shadow-sm ring-1 ring-inset ring-white/10"
              : "text-navy-200 hover:bg-white/5 hover:text-white"
          )}
        >
          <Icon size={17} className={isActive(href) ? "text-gold-400" : "text-navy-300"} />
          {label}
          {href === "/users" && access.pendingCount > 0 && (
            <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-gold-500 px-1 text-[10px] font-extrabold text-navy-950">
              {access.pendingCount}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-gold-500 bg-white/5">
        <Truck size={18} className="text-gold-400" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-extrabold leading-tight text-white">
          {company.name}
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gold-400">
          Transport Billing
        </p>
      </div>
    </div>
  );

  const backendBadge = (
    <div className="grid gap-2 border-t border-white/10 p-3">
      <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
        {backend === "supabase" ? (
          <Database size={14} className="text-emerald-400" />
        ) : (
          <HardDrive size={14} className="text-gold-400" />
        )}
        <div className="min-w-0">
          <p className="truncate text-[11px] font-bold text-white">
            {backend === "supabase" ? access.who : "Local storage"}
          </p>
          <p className="truncate text-[10px] text-navy-300">
            {backend === "supabase"
              ? access.isOwner
                ? "Owner · full access"
                : `${access.me?.permissions.length ?? 0} module${
                    (access.me?.permissions.length ?? 0) === 1 ? "" : "s"
                  }`
              : "Saved in this browser"}
          </p>
        </div>
      </div>

      {signedInAs && (
        <button
          onClick={signOut}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold text-navy-200 transition hover:bg-white/5 hover:text-white"
        >
          <LogOut size={14} /> Sign out
        </button>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col justify-between bg-navy-900 lg:flex">
        <div>
          {brand}
          {nav}
        </div>
        {backendBadge}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="animate-fade fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col justify-between bg-navy-900 shadow-pop">
            <div>
              <div className="flex items-center justify-between border-b border-white/10 pr-2">
                <div className="min-w-0 flex-1">{brand}</div>
                <button
                  onClick={() => setOpen(false)}
                  className="p-3 text-navy-200"
                  aria-label="Close menu"
                >
                  <X size={20} />
                </button>
              </div>
              {nav}
            </div>
            {backendBadge}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-navy-200 bg-white/90 px-2 py-2 backdrop-blur lg:hidden">
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg p-2.5 text-navy-700 active:bg-navy-100"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-navy-900">
            {company.name}
          </span>
        </header>

        {error && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            <strong className="font-semibold">Save failed:</strong> {error}
          </div>
        )}

        {/* pb-24 on mobile clears the bottom tab bar */}
        <main
          key={pathname}
          className="animate-rise mx-auto w-full max-w-[1400px] flex-1 px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-8 lg:pt-6"
        >
          {!permitted ? <NoAccess /> : ready ? children : <LoadingState />}
        </main>
      </div>

      {/* Bottom tab bar — thumb-reachable on a phone */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-navy-200 bg-white/95 backdrop-blur lg:hidden">
        <div className="flex">
          {(allowed.some((n) => MOBILE_NAV.includes(n.href))
            ? allowed.filter((n) => MOBILE_NAV.includes(n.href))
            : allowed.slice(0, 5)
          ).map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cx(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-bold transition",
                isActive(href) ? "text-navy-900" : "text-navy-400"
              )}
            >
              <Icon size={19} className={isActive(href) ? "text-gold-500" : ""} />
              {label}
            </Link>
          ))}
        </div>
        {/* iPhone home-indicator inset */}
        <div style={{ height: "env(safe-area-inset-bottom)" }} />
      </nav>
    </div>
  );
}

/** A deactivated account: signed in, but the owner has switched it off. */
function LockedOut({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-900 px-4">
      <div className="animate-pop w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-pop">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-red-50 text-red-600">
          <Lock size={22} />
        </div>
        <p className="text-base font-bold text-navy-900">This account is locked</p>
        <p className="mt-1 text-sm text-navy-500">
          The owner has switched it off. Ask them to turn it back on.
        </p>
        <button onClick={onSignOut} className="btn-ghost mt-5 w-full">
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </div>
  );
}

function NoAccess() {
  return (
    <div className="mx-auto mt-10 max-w-sm rounded-xl border border-navy-200 bg-white p-8 text-center shadow-card">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-navy-100 text-navy-500">
        <Lock size={22} />
      </div>
      <p className="text-sm font-bold text-navy-900">You don&apos;t have access to this</p>
      <p className="mt-1 text-sm text-navy-500">
        Ask the owner to give your account this module.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-4">
      <div className="skeleton h-8 w-52 rounded-lg" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-20 sm:h-24" />
        ))}
      </div>
      <div className="skeleton h-72" />
    </div>
  );
}
