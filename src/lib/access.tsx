"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ActivityEvent, AppUser, ChangeRequest, Entry, Permission } from "./types";
import { getSupabase, supabaseConfigured } from "./supabase";
import { uid } from "./calc";

interface NewUser {
  username: string;
  name: string;
  password: string;
  role: "owner" | "staff";
  permissions: Permission[];
}

interface UserPatch {
  username?: string;
  name?: string;
  password?: string;
  role?: "owner" | "staff";
  permissions?: Permission[];
  active?: boolean;
}

interface AccessValue {
  ready: boolean;
  /** The signed-in account's own record. Null for the original owner and in local mode. */
  me: AppUser | null;
  /** The Supabase auth id, which changes the moment somebody else signs in. */
  userId: string | null;
  email: string | null;
  /** Display name for whoever is signed in. */
  who: string;
  isOwner: boolean;
  can: (perm: Permission) => boolean;
  /** Signed in, but the owner has switched this account off. */
  locked: boolean;
  /** True when there is no backend, so accounts can't exist at all. */
  localMode: boolean;

  users: AppUser[];
  requests: ChangeRequest[];
  activity: ActivityEvent[];
  pendingCount: number;
  /** Ids of entries with a change waiting on the owner. */
  pendingEntryIds: Set<string>;

  refresh: () => Promise<void>;
  createUser: (input: NewUser) => Promise<void>;
  updateUser: (id: string, patch: UserPatch) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;

  requestEntryChange: (
    kind: "update" | "delete",
    entry: Entry,
    previous: Entry | undefined,
    summary: string
  ) => Promise<void>;
  decideRequest: (id: string, status: "approved" | "rejected", note?: string) => Promise<void>;
  log: (
    action: ActivityEvent["action"],
    entity: string,
    recordId: string | undefined,
    summary: string
  ) => Promise<void>;
}

const Ctx = createContext<AccessValue | null>(null);

/**
 * Who is signed in, and what they're allowed to touch.
 *
 * Kept apart from the data store: this is about the person, not the ledger.
 * Note that hiding a tab is a convenience, not the security boundary — that
 * lives in the row-level policies in supabase/schema.sql, which is what
 * actually stops a staff account from rewriting an entry.
 */
export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!supabaseConfigured);
  const [me, setMe] = useState<AppUser | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);

  const load = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) {
      setReady(true);
      return;
    }

    // The whole interface waits on `ready`, so it has to be set no matter how
    // this goes — a dropped connection here must not leave a blank screen.
    try {
      const {
        data: { user },
      } = await sb.auth.getUser();
      setEmail(user?.email ?? null);
      setUserId(user?.id ?? null);

      if (!user) {
        setMe(null);
        setUsers([]);
        setRequests([]);
        setActivity([]);
        return;
      }

      const [mine, all, reqs, acts] = await Promise.all([
        sb.from("app_users").select("*").eq("id", user.id).maybeSingle(),
        sb.from("app_users").select("*"),
        sb.from("change_requests").select("*").order("createdAt", { ascending: false }).limit(300),
        sb.from("activity_log").select("*").order("at", { ascending: false }).limit(300),
      ]);

      // A missing table (schema not run yet) shouldn't take the whole app down.
      setMe((mine.data as AppUser | null) ?? null);
      setUsers((all.data as AppUser[] | null) ?? []);
      setRequests((reqs.data as ChangeRequest[] | null) ?? []);
      setActivity((acts.data as ActivityEvent[] | null) ?? []);
    } catch {
      // Falls through to `ready` with nobody signed in, which shows the
      // login gate rather than a spinner that never stops.
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Signing in doesn't remount this provider — the app just navigates — so
   * without this the session that arrives at login is never noticed, and
   * whoever signed in keeps the permissions of whoever came before (none,
   * which reads as the owner). That was the "everything looks fine until you
   * refresh" bug.
   */
  const loadedFor = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, session) => {
      const next = session?.user?.id ?? null;
      // Token refreshes fire this too; only a different person matters.
      if (loadedFor.current === next) return;
      loadedFor.current = next;
      load();
    });
    return () => subscription.unsubscribe();
  }, [load]);

  /** Approvals and accounts arrive as they happen, not on the next refresh. */
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !userId) return;

    let timer: ReturnType<typeof setTimeout>;
    const bump = () => {
      clearTimeout(timer);
      timer = setTimeout(load, 300);
    };

    let channel = sb.channel("access-live");
    for (const table of ["app_users", "change_requests", "activity_log"]) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, bump);
    }
    channel.subscribe();

    return () => {
      clearTimeout(timer);
      sb.removeChannel(channel);
    };
  }, [userId, load]);

  // Deactivating an account can't sign it out on its own, so the app treats a
  // locked user as having nothing — and the row policies refuse its writes.
  const locked = Boolean(me && !me.active);

  // No record means the original owner account, made in the Supabase
  // dashboard before this screen existed — it keeps full rights. Note the
  // `ready` guard: until the record is actually back, nobody is an owner,
  // so a staff account can never flash the full interface on the way in.
  const isOwner = ready && !locked && (!supabaseConfigured || !me || me.role === "owner");

  const can = useCallback(
    (perm: Permission) => (locked ? false : isOwner || (me?.permissions ?? []).includes(perm)),
    [locked, isOwner, me]
  );

  const who = me?.name || email?.split("@")[0] || "Owner";

  const post = useCallback(async (url: string, method: string, body?: unknown) => {
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status}).`);
    return json;
  }, []);

  const createUser = useCallback(
    async (input: NewUser) => {
      await post("/api/users", "POST", input);
      await load();
    },
    [post, load]
  );

  const updateUser = useCallback(
    async (id: string, patch: UserPatch) => {
      await post(`/api/users/${id}`, "PATCH", patch);
      await load();
    },
    [post, load]
  );

  const deleteUser = useCallback(
    async (id: string) => {
      await post(`/api/users/${id}`, "DELETE");
      await load();
    },
    [post, load]
  );

  const log = useCallback(
    async (
      action: ActivityEvent["action"],
      entity: string,
      recordId: string | undefined,
      summary: string
    ) => {
      const sb = getSupabase();
      if (!sb) return;
      const row: ActivityEvent = {
        id: uid(),
        userId: me?.id,
        userName: who,
        action,
        entity,
        recordId,
        summary,
        at: new Date().toISOString(),
      };
      const { error } = await sb.from("activity_log").insert(row);
      if (!error) setActivity((prev) => [row, ...prev]);
    },
    [me, who]
  );

  const requestEntryChange = useCallback(
    async (
      kind: "update" | "delete",
      entry: Entry,
      previous: Entry | undefined,
      summary: string
    ) => {
      const sb = getSupabase();
      if (!sb) throw new Error("No backend configured.");
      const row: ChangeRequest = {
        id: uid(),
        userId: me?.id,
        userName: who,
        kind,
        entity: "entries",
        recordId: entry.id,
        payload: kind === "update" ? entry : undefined,
        // The "before" copy exists only to show the owner a diff, so the photo
        // data is dropped — keeping it would double a request that already
        // carries every scan twice over.
        previous: previous && {
          ...previous,
          photos: (previous.photos ?? []).map((p) => ({ ...p, src: "" })),
        },
        summary,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      const { error } = await sb.from("change_requests").insert(row);
      if (error) throw error;
      setRequests((prev) => [row, ...prev]);
      await log("request", "entries", entry.id, summary);
    },
    [me, who, log]
  );

  const decideRequest = useCallback(
    async (id: string, status: "approved" | "rejected", note?: string) => {
      const sb = getSupabase();
      if (!sb) throw new Error("No backend configured.");
      const patch = {
        status,
        note: note ?? null,
        decidedAt: new Date().toISOString(),
        decidedBy: who,
      };
      const { error } = await sb.from("change_requests").update(patch).eq("id", id);
      if (error) throw error;
      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...patch, note: note ?? undefined } : r))
      );
    },
    [who]
  );

  const pending = useMemo(() => requests.filter((r) => r.status === "pending"), [requests]);

  const value: AccessValue = {
    ready,
    me,
    userId,
    email,
    who,
    isOwner,
    can,
    locked,
    localMode: !supabaseConfigured,
    users,
    requests,
    activity,
    pendingCount: pending.length,
    pendingEntryIds: useMemo(() => new Set(pending.map((r) => r.recordId)), [pending]),
    refresh: load,
    createUser,
    updateUser,
    deleteUser,
    requestEntryChange,
    decideRequest,
    log,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccess(): AccessValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAccess must be used inside <AccessProvider>");
  return v;
}
