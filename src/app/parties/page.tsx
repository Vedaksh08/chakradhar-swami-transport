"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, Plus, Pencil, Trash2, Search, FileText } from "lucide-react";
import type { Party } from "@/lib/types";
import { useStore } from "@/lib/store";
import { entryTotal, fyLabel, inr, today, uid } from "@/lib/calc";
import {
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Stat,
  Table,
  Textarea,
} from "@/components/ui";

function blankParty(): Party {
  return { id: uid(), name: "", createdAt: new Date().toISOString() };
}

export default function PartiesPage() {
  const store = useStore();
  const { parties, entries, company } = store;

  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Party | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Party | null>(null);

  /** Trip count + billed value per party. */
  const stats = useMemo(() => {
    const m = new Map<string, { trips: number; total: number; unbilled: number }>();
    for (const e of entries) {
      const s = m.get(e.partyId) ?? { trips: 0, total: 0, unbilled: 0 };
      s.trips += 1;
      s.total += entryTotal(e);
      if (!e.invoiceId) s.unbilled += entryTotal(e);
      m.set(e.partyId, s);
    }
    return m;
  }, [entries]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return parties
      .filter((p) =>
        !n ? true : [p.name, p.address, p.gstin, p.contactPerson].join(" ").toLowerCase().includes(n)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [parties, q]);

  const totalUnbilled = useMemo(
    () => [...stats.values()].reduce((s, x) => s + x.unbilled, 0),
    [stats]
  );

  const valid = Boolean(draft?.name.trim());

  async function save() {
    if (!draft || !valid) return;
    await store.saveParty({ ...draft, name: draft.name.trim() });
    setDraft(null);
  }

  const partyEntryCount = confirmDelete
    ? entries.filter((e) => e.partyId === confirmDelete.id).length
    : 0;
  const partyInvoiceCount = confirmDelete
    ? store.invoices.filter((i) => i.partyId === confirmDelete.id).length
    : 0;

  return (
    <>
      <PageHeader
        title="Parties"
        subtitle="The companies you bill. Their details flow onto every invoice automatically."
        actions={
          <button
            onClick={() => {
              setDraft(blankParty());
              setIsNew(true);
            }}
            className="btn-primary"
          >
            <Plus size={16} /> New party
          </button>
        }
      />

      <div className="stagger mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <Stat label="Parties" value={parties.length} />
        <Stat label="Total trips" value={entries.length} />
        <Stat label="Unbilled value" value={`₹${inr(totalUnbilled)}`} tone="gold" />
      </div>

      <Card bodyClassName="p-0">
        <div className="border-b border-navy-100 p-4">
          <div className="relative max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search parties…"
              className="pl-9"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Building2 size={32} />}
            title={parties.length ? "No matches" : "No parties yet"}
            message={
              parties.length
                ? "Try a different search."
                : "Create your first party to start recording entries against it."
            }
            action={
              <button
                onClick={() => {
                  setDraft(blankParty());
                  setIsNew(true);
                }}
                className="btn-primary"
              >
                <Plus size={16} /> New party
              </button>
            }
          />
        ) : (
          <Table
            head={
              <>
                <th className="th">Party</th>
                <th className="th">Address</th>
                <th className="th">GSTIN</th>
                <th className="th">Contact</th>
                <th className="th text-right">Trips</th>
                <th className="th text-right">Billed value</th>
                <th className="th text-right">Unbilled</th>
                <th className="th"></th>
              </>
            }
          >
            {filtered.map((p) => {
              const s = stats.get(p.id) ?? { trips: 0, total: 0, unbilled: 0 };
              return (
                <tr key={p.id} className="group transition hover:bg-navy-50/60">
                  <td className="td">
                    <Link
                      href={`/parties/${p.id}`}
                      className="font-bold text-navy-900 hover:underline"
                    >
                      {p.name}
                    </Link>
                    {p.code && (
                      <span className="ml-2 rounded bg-navy-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-navy-600">
                        {p.code}
                      </span>
                    )}
                  </td>
                  <td className="td max-w-[240px] truncate text-navy-600">{p.address || "—"}</td>
                  <td className="td font-mono text-xs">{p.gstin || "—"}</td>
                  <td className="td text-navy-600">
                    {p.contactPerson || p.phone ? (
                      <div className="leading-tight">
                        <div>{p.contactPerson || "—"}</div>
                        {p.phone && <div className="text-xs text-navy-400">{p.phone}</div>}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="td tabular text-right">{s.trips}</td>
                  <td className="td tabular text-right font-semibold">₹{inr(s.total)}</td>
                  <td className="td tabular text-right">
                    {s.unbilled ? (
                      <span className="font-bold text-gold-700">₹{inr(s.unbilled)}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="td">
                    <div className="flex items-center justify-end gap-1 opacity-100 transition lg:opacity-0 lg:group-hover:opacity-100">
                      {s.unbilled > 0 && (
                        <Link
                          href={`/invoices?party=${p.id}`}
                          className="rounded-lg p-1.5 text-navy-500 hover:bg-navy-100"
                          title="Create invoice"
                        >
                          <FileText size={15} />
                        </Link>
                      )}
                      <button
                        onClick={() => {
                          setDraft(p);
                          setIsNew(false);
                        }}
                        className="rounded-lg p-1.5 text-navy-500 hover:bg-navy-100"
                        title="Edit"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(p)}
                        className="rounded-lg p-1.5 text-navy-400 hover:bg-red-50 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={isNew ? "New party" : "Edit party"}
        subtitle="These details print on the invoice header."
        footer={
          <>
            <button className="btn-ghost" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save} disabled={!valid}>
              Save party
            </button>
          </>
        }
      >
        {draft && (
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="Party / company name" required className="sm:col-span-3">
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="MTC BUSINESS PVT LTD"
                />
              </Field>
              <Field
                label="Code"
                hint={`e.g. ${company.invoicePrefix ?? "CST"}/${
                  draft.code?.trim().toUpperCase() || "MTC"
                }/01/${fyLabel(today())}`}
              >
                <Input
                  value={draft.code ?? ""}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                  placeholder="MTC"
                  className="uppercase"
                  maxLength={12}
                />
              </Field>
            </div>
            <Field label="Branch address">
              <Textarea
                rows={3}
                value={draft.address ?? ""}
                onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                placeholder={"Nanekarwadi, Chakan,\nTal. Khed, Dist. Pune – 410 501"}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="GSTIN">
                <Input
                  value={draft.gstin ?? ""}
                  onChange={(e) => setDraft({ ...draft, gstin: e.target.value.toUpperCase() })}
                  placeholder="27AACCM4795M3ZR"
                  className="font-mono uppercase"
                />
              </Field>
              <Field label="PAN">
                <Input
                  value={draft.pan ?? ""}
                  onChange={(e) => setDraft({ ...draft, pan: e.target.value.toUpperCase() })}
                  placeholder="AACCM4795M"
                  className="font-mono uppercase"
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Contact person">
                <Input
                  value={draft.contactPerson ?? ""}
                  onChange={(e) => setDraft({ ...draft, contactPerson: e.target.value })}
                />
              </Field>
              <Field label="Phone">
                <Input
                  value={draft.phone ?? ""}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={draft.email ?? ""}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Notes">
              <Textarea
                rows={2}
                value={draft.notes ?? ""}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete this party?"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </button>
            <button
              className="btn-danger"
              onClick={async () => {
                if (confirmDelete) await store.deleteParty(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              Delete
            </button>
          </>
        }
      >
        {partyEntryCount > 0 || partyInvoiceCount > 0 ? (
          <p className="text-sm text-navy-600">
            <strong>{confirmDelete?.name}</strong> will be removed permanently, along with{" "}
            {partyEntryCount > 0 && (
              <>
                <strong>{partyEntryCount}</strong> {partyEntryCount === 1 ? "entry" : "entries"}
              </>
            )}
            {partyEntryCount > 0 && partyInvoiceCount > 0 && " and "}
            {partyInvoiceCount > 0 && (
              <>
                <strong>{partyInvoiceCount}</strong> {partyInvoiceCount === 1 ? "invoice" : "invoices"}
              </>
            )}{" "}
            recorded against it. This cannot be undone.
          </p>
        ) : (
          <p className="text-sm text-navy-600">
            <strong>{confirmDelete?.name}</strong> will be removed permanently.
          </p>
        )}
      </Modal>
    </>
  );
}
