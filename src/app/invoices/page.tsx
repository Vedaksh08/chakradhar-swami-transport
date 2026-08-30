"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FileText, Plus, Printer, Trash2, Pencil, Search } from "lucide-react";
import type { Entry, Invoice } from "@/lib/types";
import { useStore } from "@/lib/store";
import {
  entryTotal,
  fmtDate,
  inr,
  inrShort,
  num,
  round2,
  startOfMonth,
  today,
  uid,
} from "@/lib/calc";
import {
  Card,
  Chip,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Stat,
  Table,
  Textarea,
} from "@/components/ui";

export default function InvoicesPage() {
  const store = useStore();
  const { invoices, parties, entries, partyName } = store;
  const search = useSearchParams();

  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Invoice | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Invoice | null>(null);

  const openNew = (partyId = "") => {
    setDraft({
      id: uid(),
      invoiceNo: store.nextInvoiceNo(),
      date: today(),
      partyId,
      fromDate: startOfMonth(),
      toDate: today(),
      entryIds: [],
      freightAmount: 0,
      gstPaidByParty: true,
      total: 0,
      createdAt: new Date().toISOString(),
    });
    setIsNew(true);
  };

  // Deep link from the Parties tab: /invoices?party=<id>
  useEffect(() => {
    const p = search.get("party");
    if (p && parties.some((x) => x.id === p)) openNew(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, parties.length]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return invoices
      .filter((i) => (!n ? true : `${i.invoiceNo} ${partyName(i.partyId)}`.toLowerCase().includes(n)))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [invoices, q, partyName]);

  const totalBilled = useMemo(() => invoices.reduce((s, i) => s + i.total, 0), [invoices]);
  const unbilledValue = useMemo(
    () => entries.filter((e) => !e.invoiceId).reduce((s, e) => s + entryTotal(e), 0),
    [entries]
  );

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Pick a party and a date range — every entry in that window rolls into one bill."
        actions={
          <button onClick={() => openNew()} className="btn-primary" disabled={!parties.length}>
            <Plus size={16} /> Create invoice
          </button>
        }
      />

      <div className="stagger mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <Stat label="Invoices" value={invoices.length} />
        <Stat label="Total billed" value={`₹${inrShort(totalBilled)}`} tone="green" />
        <Stat
          label="Unbilled entries"
          value={`₹${inrShort(unbilledValue)}`}
          tone="gold"
          sub={`${entries.filter((e) => !e.invoiceId).length} entries waiting`}
        />
      </div>

      <Card bodyClassName="p-0">
        <div className="border-b border-navy-100 p-4">
          <div className="relative max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search invoice no. or party…"
              className="pl-9"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<FileText size={32} />}
            title={invoices.length ? "No matches" : "No invoices yet"}
            message={
              invoices.length
                ? "Try a different search."
                : "Record some entries, then roll them up into your first invoice."
            }
            action={
              parties.length ? (
                <button onClick={() => openNew()} className="btn-primary">
                  <Plus size={16} /> Create invoice
                </button>
              ) : undefined
            }
          />
        ) : (
          <Table
            head={
              <>
                <th className="th">Invoice No</th>
                <th className="th">Date</th>
                <th className="th">Party</th>
                <th className="th">Period</th>
                <th className="th text-right">Entries</th>
                <th className="th text-right">Freight</th>
                <th className="th text-right">Total</th>
                <th className="th">GST</th>
                <th className="th"></th>
              </>
            }
          >
            {filtered.map((i) => (
              <tr key={i.id} className="group transition hover:bg-navy-50/60">
                <td className="td font-bold text-navy-900">
                  <Link href={`/invoices/${i.id}/print`} className="hover:underline">
                    {i.invoiceNo}
                  </Link>
                </td>
                <td className="td">{fmtDate(i.date)}</td>
                <td className="td max-w-[220px] truncate">{partyName(i.partyId)}</td>
                <td className="td text-xs text-navy-500">
                  {fmtDate(i.fromDate)} → {fmtDate(i.toDate)}
                </td>
                <td className="td tabular text-right">{i.entryIds.length}</td>
                <td className="td tabular text-right">₹{inr(i.freightAmount)}</td>
                <td className="td tabular text-right font-bold">₹{inr(i.total)}</td>
                <td className="td">
                  {i.gstPaidByParty ? (
                    <Chip tone="slate">By party</Chip>
                  ) : (
                    <Chip tone="gold">
                      {num(i.sgstPercent) + num(i.cgstPercent)}%
                    </Chip>
                  )}
                </td>
                <td className="td">
                  <div className="flex items-center justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                    <Link
                      href={`/invoices/${i.id}/print`}
                      className="rounded-lg p-1.5 text-navy-500 hover:bg-navy-100"
                      title="Print / view"
                    >
                      <Printer size={15} />
                    </Link>
                    <button
                      onClick={() => {
                        setDraft(i);
                        setIsNew(false);
                      }}
                      className="rounded-lg p-1.5 text-navy-500 hover:bg-navy-100"
                      title="Edit"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(i)}
                      className="rounded-lg p-1.5 text-navy-400 hover:bg-red-50 hover:text-red-600"
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {draft && (
        <InvoiceBuilder
          key={draft.id}
          draft={draft}
          isNew={isNew}
          onClose={() => setDraft(null)}
        />
      )}

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete this invoice?"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </button>
            <button
              className="btn-danger"
              onClick={async () => {
                if (confirmDelete) await store.deleteInvoice(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm text-navy-600">
          Invoice <strong>{confirmDelete?.invoiceNo}</strong> will be removed. Its{" "}
          <strong>{confirmDelete?.entryIds.length}</strong> entries go back to unbilled and can be
          invoiced again.
        </p>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ builder */

function InvoiceBuilder({
  draft: initial,
  isNew,
  onClose,
}: {
  draft: Invoice;
  isNew: boolean;
  onClose: () => void;
}) {
  const store = useStore();
  const { parties, entriesFor, partyName } = store;
  const [inv, setInv] = useState<Invoice>(initial);
  const [excluded, setExcluded] = useState<Set<string>>(() => {
    // Editing: anything previously in range but not on the invoice stays excluded.
    if (isNew) return new Set();
    return new Set();
  });

  const set = <K extends keyof Invoice>(k: K, v: Invoice[K]) => setInv((p) => ({ ...p, [k]: v }));

  const candidates: Entry[] = useMemo(
    () => (inv.partyId ? entriesFor(inv.partyId, inv.fromDate, inv.toDate, isNew ? undefined : inv.id) : []),
    [inv.partyId, inv.fromDate, inv.toDate, inv.id, isNew, entriesFor]
  );

  const selected = useMemo(
    () => candidates.filter((e) => !excluded.has(e.id)),
    [candidates, excluded]
  );

  const freight = useMemo(
    () => round2(selected.reduce((s, e) => s + entryTotal(e), 0)),
    [selected]
  );

  const gst = inv.gstPaidByParty
    ? 0
    : round2((freight * (num(inv.sgstPercent) + num(inv.cgstPercent))) / 100);
  const total = round2(freight + gst);

  const party = parties.find((p) => p.id === inv.partyId);
  const valid = Boolean(inv.partyId && inv.invoiceNo.trim() && selected.length);

  async function save() {
    if (!valid) return;
    await store.saveInvoice(
      {
        ...inv,
        invoiceNo: inv.invoiceNo.trim(),
        entryIds: selected.map((e) => e.id),
        freightAmount: freight,
        total,
      },
      selected.map((e) => e.id)
    );
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? "Create invoice" : `Edit invoice ${initial.invoiceNo}`}
      subtitle="Entries in the date range are pulled in automatically. Untick anything you want to leave out."
      wide
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={!valid}>
            {isNew ? "Create invoice" : "Save changes"}
          </button>
        </>
      }
    >
      <div className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Invoice no." required hint="Auto-numbered — edit freely">
            <Input value={inv.invoiceNo} onChange={(e) => set("invoiceNo", e.target.value)} />
          </Field>
          <Field label="Invoice date" required>
            <Input type="date" value={inv.date} onChange={(e) => set("date", e.target.value)} />
          </Field>
          <Field label="From date" required>
            <Input
              type="date"
              value={inv.fromDate}
              onChange={(e) => set("fromDate", e.target.value)}
            />
          </Field>
          <Field label="To date" required>
            <Input type="date" value={inv.toDate} onChange={(e) => set("toDate", e.target.value)} />
          </Field>
        </div>

        <Field label="Bill to party" required>
          <Select value={inv.partyId} onChange={(e) => set("partyId", e.target.value)}>
            <option value="">Select party…</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>

        {party && (
          <div className="rounded-lg border border-navy-200 bg-navy-50/50 px-4 py-3 text-sm">
            <p className="font-bold text-navy-900">{party.name}</p>
            {party.address && (
              <p className="whitespace-pre-line text-navy-600">{party.address}</p>
            )}
            {party.gstin && (
              <p className="mt-1 font-mono text-xs text-navy-500">GSTIN: {party.gstin}</p>
            )}
          </div>
        )}

        {/* Entries */}
        <div className="rounded-xl border border-navy-200">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-100 px-4 py-3">
            <div>
              <h3 className="text-sm font-bold text-navy-900">
                Entries in range · {selected.length} of {candidates.length}
              </h3>
              <p className="text-xs text-navy-500">
                Only unbilled entries appear here.
              </p>
            </div>
            {candidates.length > 0 && (
              <div className="flex gap-2">
                <button className="btn-ghost btn-sm" onClick={() => setExcluded(new Set())}>
                  Select all
                </button>
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => setExcluded(new Set(candidates.map((e) => e.id)))}
                >
                  Clear
                </button>
              </div>
            )}
          </header>

          {!inv.partyId ? (
            <p className="px-4 py-8 text-center text-sm text-navy-400">
              Choose a party to see its entries.
            </p>
          ) : candidates.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-navy-400">
              No unbilled entries for {partyName(inv.partyId)} between {fmtDate(inv.fromDate)} and{" "}
              {fmtDate(inv.toDate)}.
            </p>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              <Table
                head={
                  <>
                    <th className="th w-10"></th>
                    <th className="th">Date</th>
                    <th className="th">Inv. No</th>
                    <th className="th">Vehicle</th>
                    <th className="th text-right">Qty</th>
                    <th className="th text-right">Amount</th>
                    <th className="th text-right">Detention</th>
                    <th className="th text-right">Total</th>
                  </>
                }
              >
                {candidates.map((e) => {
                  const on = !excluded.has(e.id);
                  return (
                    <tr key={e.id} className={on ? "" : "opacity-45"}>
                      <td className="td">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setExcluded((prev) => {
                              const next = new Set(prev);
                              on ? next.add(e.id) : next.delete(e.id);
                              return next;
                            })
                          }
                          className="h-4 w-4 rounded border-navy-300 text-navy-800 focus:ring-navy-500"
                        />
                      </td>
                      <td className="td">{fmtDate(e.date)}</td>
                      <td className="td font-semibold">{e.invoiceNo}</td>
                      <td className="td font-mono text-xs">{e.vehicleNo}</td>
                      <td className="td tabular text-right">{e.qty ? e.qty.toFixed(3) : "—"}</td>
                      <td className="td tabular text-right">{inr(e.amount)}</td>
                      <td className="td tabular text-right text-gold-700">
                        {e.detention ? inr(e.detention) : "—"}
                      </td>
                      <td className="td tabular text-right font-bold">{inr(entryTotal(e))}</td>
                    </tr>
                  );
                })}
              </Table>
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid gap-3">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-navy-200 px-3 py-2.5">
              <input
                type="checkbox"
                checked={inv.gstPaidByParty}
                onChange={(e) => set("gstPaidByParty", e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-navy-300 text-navy-800 focus:ring-navy-500"
              />
              <span>
                <span className="block text-sm font-bold text-navy-900">GST paid by party</span>
                <span className="block text-xs text-navy-500">
                  Reverse charge — no GST added to this bill.
                </span>
              </span>
            </label>

            {!inv.gstPaidByParty && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="SGST %">
                  <Input
                    type="number"
                    step="0.01"
                    value={inv.sgstPercent ?? ""}
                    onChange={(e) =>
                      set("sgstPercent", e.target.value === "" ? undefined : num(e.target.value))
                    }
                  />
                </Field>
                <Field label="CGST %">
                  <Input
                    type="number"
                    step="0.01"
                    value={inv.cgstPercent ?? ""}
                    onChange={(e) =>
                      set("cgstPercent", e.target.value === "" ? undefined : num(e.target.value))
                    }
                  />
                </Field>
              </div>
            )}

            <Field label="Notes">
              <Textarea
                rows={2}
                value={inv.notes ?? ""}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
          </div>

          <div className="rounded-xl bg-navy-800 p-5 text-white">
            <dl className="grid gap-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-navy-200">Freight amount</dt>
                <dd className="tabular font-semibold">₹{inr(freight)}</dd>
              </div>
              {!inv.gstPaidByParty && (
                <div className="flex justify-between">
                  <dt className="text-navy-200">
                    GST ({num(inv.sgstPercent) + num(inv.cgstPercent)}%)
                  </dt>
                  <dd className="tabular font-semibold">₹{inr(gst)}</dd>
                </div>
              )}
              <div className="mt-2 flex items-baseline justify-between border-t border-white/20 pt-3">
                <dt className="text-xs font-bold uppercase tracking-wider text-navy-200">Total</dt>
                <dd className="tabular text-2xl font-extrabold text-gold-400">₹{inr(total)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-navy-300">
              {selected.length} {selected.length === 1 ? "entry" : "entries"} ·{" "}
              {fmtDate(inv.fromDate)} to {fmtDate(inv.toDate)}
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
