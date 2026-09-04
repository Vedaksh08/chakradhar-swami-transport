"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ShieldCheck,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Clock,
  History,
  UserRound,
  KeyRound,
  AlertTriangle,
} from "lucide-react";
import type { AppUser, ChangeRequest, Entry, Permission } from "@/lib/types";
import { PERMISSIONS } from "@/lib/types";
import { useStore } from "@/lib/store";
import { useAccess } from "@/lib/access";
import { fmtDate, inr } from "@/lib/calc";
import { validatePassword, validateUsername } from "@/lib/users";
import {
  Card,
  Chip,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Stat,
  Table,
  Textarea,
  cx,
} from "@/components/ui";

type Tab = "users" | "approvals" | "activity";

interface Draft {
  id?: string;
  username: string;
  name: string;
  password: string;
  role: "owner" | "staff";
  permissions: Permission[];
  active: boolean;
}

const blankDraft = (): Draft => ({
  username: "",
  name: "",
  password: "",
  role: "staff",
  permissions: ["entries"],
  active: true,
});

export default function UsersPage() {
  const access = useAccess();
  const store = useStore();

  const [tab, setTab] = useState<Tab>("users");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AppUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [setupHint, setSetupHint] = useState<string | null>(null);

  // Creating accounts needs a server key. Say so up front rather than after
  // the owner has filled in a form.
  useEffect(() => {
    if (access.localMode) return;
    fetch("/api/users")
      .then((r) => r.json())
      .then((j) => setSetupHint(j?.adminConfigured ? null : (j?.hint ?? null)))
      .catch(() => {});
  }, [access.localMode]);

  const pending = useMemo(
    () => access.requests.filter((r) => r.status === "pending"),
    [access.requests]
  );
  const decided = useMemo(
    () => access.requests.filter((r) => r.status !== "pending").slice(0, 50),
    [access.requests]
  );

  const staff = access.users.filter((u) => u.role === "staff");

  async function submit() {
    if (!draft) return;
    setError(null);

    const nameBad = draft.name.trim() ? null : "Add a name.";
    const userBad = validateUsername(draft.username);
    const passBad =
      draft.password || draft.id ? (draft.password ? validatePassword(draft.password) : null) : "Set a password.";
    const bad = nameBad ?? userBad ?? passBad;
    if (bad) return setError(bad);

    setBusy(true);
    try {
      if (draft.id) {
        await access.updateUser(draft.id, {
          username: draft.username,
          name: draft.name,
          role: draft.role,
          permissions: draft.permissions,
          active: draft.active,
          ...(draft.password ? { password: draft.password } : {}),
        });
      } else {
        await access.createUser({
          username: draft.username,
          name: draft.name,
          password: draft.password,
          role: draft.role,
          permissions: draft.permissions,
        });
      }
      setDraft(null);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  /** Approving is what actually writes the staff member's change through. */
  async function approve(r: ChangeRequest) {
    setBusy(true);
    setError(null);
    try {
      if (r.kind === "update" && r.payload) await store.saveEntry(r.payload);
      if (r.kind === "delete") await store.deleteEntry(r.recordId);
      await access.decideRequest(r.id, "approved");
      await access.log("approve", "entries", r.recordId, `Approved: ${r.summary}`);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function reject(r: ChangeRequest) {
    setBusy(true);
    setError(null);
    try {
      await access.decideRequest(r.id, "rejected");
      await access.log("reject", "entries", r.recordId, `Rejected: ${r.summary}`);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  if (access.localMode) {
    return (
      <>
        <PageHeader title="Users" subtitle="Accounts and what each person can reach." />
        <Card>
          <EmptyState
            icon={<ShieldCheck size={32} />}
            title="Accounts need the cloud database"
            message="This browser-only mode has no sign-in at all. Connect Supabase in Settings, then come back to create accounts for your staff."
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Who can sign in, what they can reach, and everything they've done."
        actions={
          tab === "users" ? (
            <button onClick={() => setDraft(blankDraft())} className="btn-primary">
              <Plus size={16} /> New user
            </button>
          ) : undefined
        }
      />

      {setupHint && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-gold-300 bg-gold-50 px-4 py-3 text-sm text-gold-900">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">One setup step left before accounts can be created</p>
            <p className="mt-0.5 text-xs leading-relaxed">{setupHint}</p>
          </div>
        </div>
      )}

      <div className="stagger mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <Stat label="Accounts" value={access.users.length} sub={`${staff.length} staff`} />
        <Stat
          label="Waiting on you"
          value={pending.length}
          tone={pending.length ? "gold" : "navy"}
          sub="edits needing approval"
        />
        <Stat label="Logged actions" value={access.activity.length} />
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      <div className="mb-5 inline-flex rounded-lg bg-navy-100 p-1">
        {(
          [
            { key: "users", label: "Users", icon: UserRound },
            { key: "approvals", label: `Approvals${pending.length ? ` (${pending.length})` : ""}`, icon: Clock },
            { key: "activity", label: "Activity", icon: History },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            className={cx(
              "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-bold transition",
              tab === t.key ? "bg-white text-navy-900 shadow-sm" : "text-navy-500 hover:text-navy-800"
            )}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "users" && (
        <Card bodyClassName="p-0">
          {access.users.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck size={32} />}
              title="No accounts yet"
              message="Create one for each person who needs to work in here. You stay the only one who can grant access or approve edits."
              action={
                <button onClick={() => setDraft(blankDraft())} className="btn-primary">
                  <Plus size={16} /> New user
                </button>
              }
            />
          ) : (
            <Table
              head={
                <>
                  <th className="th">Name</th>
                  <th className="th">Login ID</th>
                  <th className="th">Role</th>
                  <th className="th">Can reach</th>
                  <th className="th">Status</th>
                  <th className="th"></th>
                </>
              }
            >
              {access.users.map((u) => (
                <tr key={u.id} className="group transition hover:bg-navy-50/60">
                  <td className="td font-bold text-navy-900">
                    {u.name}
                    {u.id === access.me?.id && (
                      <span className="ml-1.5 text-[10px] font-bold uppercase text-navy-400">
                        you
                      </span>
                    )}
                  </td>
                  <td className="td font-mono text-xs">{u.username}</td>
                  <td className="td">
                    {u.role === "owner" ? (
                      <Chip tone="gold">Owner</Chip>
                    ) : (
                      <Chip tone="slate">Staff</Chip>
                    )}
                  </td>
                  <td className="td">
                    {u.role === "owner" ? (
                      <span className="text-xs text-navy-500">Everything</span>
                    ) : u.permissions.length ? (
                      <div className="flex flex-wrap gap-1">
                        {u.permissions.map((p) => (
                          <span
                            key={p}
                            className="rounded bg-navy-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-navy-600"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-navy-300">Nothing yet</span>
                    )}
                  </td>
                  <td className="td">
                    {u.active ? <Chip tone="green">Active</Chip> : <Chip tone="red">Locked</Chip>}
                  </td>
                  <td className="td">
                    <div className="flex items-center justify-end gap-1 opacity-100 transition lg:opacity-0 lg:group-hover:opacity-100">
                      <button
                        onClick={() =>
                          setDraft({
                            id: u.id,
                            username: u.username,
                            name: u.name,
                            password: "",
                            role: u.role,
                            permissions: u.permissions ?? [],
                            active: u.active,
                          })
                        }
                        className="rounded-lg p-1.5 text-navy-500 hover:bg-navy-100"
                        title="Edit"
                      >
                        <Pencil size={15} />
                      </button>
                      {u.id !== access.me?.id && (
                        <button
                          onClick={() => setConfirmDelete(u)}
                          className="rounded-lg p-1.5 text-navy-400 hover:bg-red-50 hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {tab === "approvals" && (
        <div className="grid gap-4">
          {pending.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Check size={32} />}
                title="Nothing waiting"
                message="When someone asks to change or remove an entry they recorded, it lands here first."
              />
            </Card>
          ) : (
            pending.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                busy={busy}
                onApprove={() => approve(r)}
                onReject={() => reject(r)}
              />
            ))
          )}

          {decided.length > 0 && (
            <Card title="Already decided" bodyClassName="p-0">
              <Table
                head={
                  <>
                    <th className="th">When</th>
                    <th className="th">Who</th>
                    <th className="th">Change</th>
                    <th className="th">Outcome</th>
                  </>
                }
              >
                {decided.map((r) => (
                  <tr key={r.id}>
                    <td className="td text-xs text-navy-500">{when(r.decidedAt ?? r.createdAt)}</td>
                    <td className="td">{r.userName}</td>
                    <td className="td max-w-[420px] truncate text-navy-600">{r.summary}</td>
                    <td className="td">
                      {r.status === "approved" ? (
                        <Chip tone="green">Approved</Chip>
                      ) : (
                        <Chip tone="red">Rejected</Chip>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}
        </div>
      )}

      {tab === "activity" && (
        <Card bodyClassName="p-0">
          {access.activity.length === 0 ? (
            <EmptyState
              icon={<History size={32} />}
              title="Nothing recorded yet"
              message="Every entry your staff add, and every change they ask for, shows up here."
            />
          ) : (
            <Table
              head={
                <>
                  <th className="th">When</th>
                  <th className="th">Who</th>
                  <th className="th">Action</th>
                  <th className="th">What</th>
                </>
              }
            >
              {access.activity.map((a) => (
                <tr key={a.id} className="transition hover:bg-navy-50/60">
                  <td className="td whitespace-nowrap text-xs text-navy-500">{when(a.at)}</td>
                  <td className="td font-semibold">{a.userName}</td>
                  <td className="td">
                    <Chip tone={actionTone(a.action)}>{a.action}</Chip>
                  </td>
                  <td className="td max-w-[520px] truncate text-navy-600">{a.summary}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {/* Create / edit */}
      <Modal
        open={!!draft}
        onClose={() => {
          setDraft(null);
          setError(null);
        }}
        title={draft?.id ? "Edit user" : "New user"}
        subtitle="Only you can set these details."
        footer={
          <>
            <button className="btn-ghost" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={submit} disabled={busy}>
              {busy ? "Saving…" : draft?.id ? "Save changes" : "Create user"}
            </button>
          </>
        }
      >
        {draft && (
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" required>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Ramesh Pawar"
                />
              </Field>
              <Field label="Login ID" required hint="What they type to sign in">
                <Input
                  value={draft.username}
                  onChange={(e) =>
                    setDraft({ ...draft, username: e.target.value.toLowerCase().trim() })
                  }
                  placeholder="ramesh"
                  className="font-mono lowercase"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </Field>
            </div>

            <Field
              label={draft.id ? "New password" : "Password"}
              required={!draft.id}
              hint={draft.id ? "Leave blank to keep the current one" : "At least 6 characters"}
            >
              <Input
                type="text"
                value={draft.password}
                onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                placeholder={draft.id ? "••••••" : "Choose a password"}
                autoComplete="new-password"
              />
            </Field>

            <Field label="Role">
              <div className="inline-flex rounded-lg bg-navy-100 p-1">
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, role: "staff" })}
                  className={cx(
                    "rounded-md px-3.5 py-1.5 text-xs font-bold transition",
                    draft.role === "staff" ? "bg-white text-navy-900 shadow-sm" : "text-navy-500"
                  )}
                >
                  Staff
                </button>
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, role: "owner" })}
                  className={cx(
                    "rounded-md px-3.5 py-1.5 text-xs font-bold transition",
                    draft.role === "owner" ? "bg-white text-navy-900 shadow-sm" : "text-navy-500"
                  )}
                >
                  Owner
                </button>
              </div>
            </Field>

            {draft.role === "owner" ? (
              <p className="rounded-lg bg-gold-50 px-3 py-2 text-xs text-gold-900">
                An owner sees everything, approves changes and can create users. Only give this to
                someone you'd trust with the books.
              </p>
            ) : (
              <div>
                <span className="label">Can reach</span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {PERMISSIONS.map((p) => {
                    const on = draft.permissions.includes(p.key);
                    return (
                      <label
                        key={p.key}
                        className={cx(
                          "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition",
                          on ? "border-navy-800 bg-navy-50" : "border-navy-200 hover:bg-navy-50/60"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setDraft({
                              ...draft,
                              permissions: on
                                ? draft.permissions.filter((x) => x !== p.key)
                                : [...draft.permissions, p.key],
                            })
                          }
                          className="mt-0.5 h-4 w-4 rounded border-navy-300 text-navy-800 focus:ring-navy-500"
                        />
                        <span>
                          <span className="block text-sm font-bold text-navy-900">{p.label}</span>
                          <span className="block text-[11px] text-navy-500">{p.hint}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-navy-500">
                  The dashboard and this screen stay yours alone. Staff can add entries, but every
                  edit or deletion comes to you first.
                </p>
              </div>
            )}

            {draft.id && (
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-navy-200 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-navy-300 text-navy-800 focus:ring-navy-500"
                />
                <span>
                  <span className="block text-sm font-bold text-navy-900">Active</span>
                  <span className="block text-xs text-navy-500">
                    Untick to keep the account but stop it being used.
                  </span>
                </span>
              </label>
            )}

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                {error}
              </p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete this account?"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </button>
            <button
              className="btn-danger"
              disabled={busy}
              onClick={async () => {
                if (!confirmDelete) return;
                setBusy(true);
                try {
                  await access.deleteUser(confirmDelete.id);
                  setConfirmDelete(null);
                } catch (e: any) {
                  setError(e?.message ?? String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm text-navy-600">
          <strong>{confirmDelete?.name}</strong> won&apos;t be able to sign in again. Entries they
          already recorded stay exactly as they are.
        </p>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------- approvals */

function RequestCard({
  request,
  busy,
  onApprove,
  onReject,
}: {
  request: ChangeRequest;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { partyName, driverName } = useStore();
  const changes = useMemo(
    () => diffEntry(request.previous, request.payload, partyName, driverName),
    [request, partyName, driverName]
  );

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={request.kind === "delete" ? "red" : "gold"}>
              {request.kind === "delete" ? "Wants to delete" : "Wants to edit"}
            </Chip>
            <span className="text-sm font-bold text-navy-900">{request.userName}</span>
            <span className="text-xs text-navy-400">{when(request.createdAt)}</span>
          </div>
          <p className="mt-1.5 text-sm text-navy-600">{request.summary}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost btn-sm" onClick={onReject} disabled={busy}>
            <X size={14} /> Reject
          </button>
          <button className="btn-primary btn-sm" onClick={onApprove} disabled={busy}>
            <Check size={14} /> Approve
          </button>
        </div>
      </div>

      {request.kind === "update" && changes.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-lg border border-navy-200">
          <table className="w-full text-sm">
            <thead className="bg-navy-50">
              <tr>
                <th className="th">Field</th>
                <th className="th">Now</th>
                <th className="th">Proposed</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.label}>
                  <td className="td font-semibold">{c.label}</td>
                  <td className="td text-navy-500 line-through">{c.from || "—"}</td>
                  <td className="td font-bold text-navy-900">{c.to || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {request.kind === "update" && changes.length === 0 && (
        <p className="mt-3 text-xs text-navy-400">
          Nothing visibly different — approving simply re-saves the entry.
        </p>
      )}
    </Card>
  );
}

interface FieldDiff {
  label: string;
  from: string;
  to: string;
}

/** The fields worth showing the owner, in the order they read naturally. */
function diffEntry(
  before: Entry | undefined,
  after: Entry | undefined,
  partyName: (id?: string) => string,
  driverName: (id?: string) => string
): FieldDiff[] {
  if (!before || !after) return [];

  const money = (v: unknown) => (v === undefined || v === null || v === "" ? "" : inr(v));
  const rows: { label: string; a: string; b: string }[] = [
    { label: "Date", a: fmtDate(before.date), b: fmtDate(after.date) },
    { label: "Direction", a: before.direction ?? "outward", b: after.direction ?? "outward" },
    { label: "Invoice / LR no.", a: before.invoiceNo ?? "", b: after.invoiceNo ?? "" },
    { label: "Party", a: partyName(before.partyId), b: partyName(after.partyId) },
    { label: "Delivered to", a: before.consignee ?? "", b: after.consignee ?? "" },
    { label: "Vehicle", a: before.vehicleNo ?? "", b: after.vehicleNo ?? "" },
    { label: "Driver", a: driverName(before.driverId), b: driverName(after.driverId) },
    { label: "Qty", a: String(before.qty ?? ""), b: String(after.qty ?? "") },
    { label: "Rate", a: money(before.rate), b: money(after.rate) },
    { label: "Amount", a: money(before.amount), b: money(after.amount) },
    { label: "Detention", a: money(before.detention), b: money(after.detention) },
    { label: "Remarks", a: before.remarks ?? "", b: after.remarks ?? "" },
  ];

  const out: FieldDiff[] = rows
    .filter((r) => r.a !== r.b)
    .map((r) => ({ label: r.label, from: r.a, to: r.b }));

  const sum = (lines?: { amount: number }[]) =>
    (lines ?? []).reduce((s, x) => s + Number(x.amount || 0), 0);

  if (sum(before.vehicleExpenses) !== sum(after.vehicleExpenses)) {
    out.push({
      label: "Vehicle expenses",
      from: inr(sum(before.vehicleExpenses)),
      to: inr(sum(after.vehicleExpenses)),
    });
  }
  if (sum(before.driverExpenses) !== sum(after.driverExpenses)) {
    out.push({
      label: "Driver expenses",
      from: inr(sum(before.driverExpenses)),
      to: inr(sum(after.driverExpenses)),
    });
  }
  if ((before.photos ?? []).length !== (after.photos ?? []).length) {
    out.push({
      label: "Photos",
      from: `${(before.photos ?? []).length}`,
      to: `${(after.photos ?? []).length}`,
    });
  }

  return out;
}

function actionTone(action: string): "navy" | "gold" | "green" | "red" | "slate" {
  if (action === "create") return "green";
  if (action === "delete" || action === "reject") return "red";
  if (action === "request") return "gold";
  if (action === "approve") return "navy";
  return "slate";
}

/** "2 Sep, 4:20 pm" — short enough for a table, precise enough to audit. */
function when(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
