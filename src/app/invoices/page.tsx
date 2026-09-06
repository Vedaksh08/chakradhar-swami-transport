"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  Plus,
  Printer,
  Trash2,
  Pencil,
  Search,
} from "lucide-react";
import type { Direction, Entry, Invoice } from "@/lib/types";
import { useStore } from "@/lib/store";
import {
  entryTotal,
  fmtDate,
  inr,
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
  Combo,
  Stat,
  Table,
  Textarea,
  cx,
} from "@/components/ui";

export default function InvoicesPage() {
  const store = useStore();
  const { invoices, parties, entries, partyName, companyName } = store;
  const search = useSearchParams();

  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Invoice | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Invoice | null>(null);

  const openNew = (opts: { partyId?: string; companyId?: string } = {}) => {
    setDraft({
      id: uid(),
      invoiceNo: opts.partyId
        ? store.nextInvoiceNo(opts.partyId, today())
        : opts.companyId
          ? store.nextInvoiceNoForCompany(opts.companyId, today())
          : "",
      date: today(),
      partyId: opts.companyId ? undefined : opts.partyId,
      companyId: opts.companyId,
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

  const billedTo = (i: Invoice) => (i.companyId ? companyName(i.companyId) : partyName(i.partyId));

  // Deep links: /invoices?party=<id> from Parties, /invoices?company=<id> from Companies.
  useEffect(() => {
    const p = search.get("party");
    const c = search.get("company");
    if (c && store.companies.some((x) => x.id === c)) openNew({ companyId: c });
    else if (p && parties.some((x) => x.id === p)) openNew({ partyId: p });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, parties.length, store.companies.length]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return invoices
      .filter((i) => (!n ? true : `${i.invoiceNo} ${billedTo(i)}`.toLowerCase().includes(n)))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [invoices, q, partyName, companyName]);

  const totalBilled = useMemo(() => invoices.reduce((s, i) => s + i.total, 0), [invoices]);
  const unbilledValue = useMemo(
    () => entries.filter((e) => !e.invoiceId).reduce((s, e) => s + entryTotal(e), 0),
    [entries]
  );

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Pick a party (or a company, to bill several parties at once) and a date range."
        actions={
          <button onClick={() => openNew()} className="btn-primary" disabled={!parties.length}>
            <Plus size={16} /> Create invoice
          </button>
        }
      />

      <div className="stagger mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <Stat label="Invoices" value={invoices.length} />
        <Stat label="Total billed" value={`₹${inr(totalBilled)}`} tone="green" />
        <Stat
          label="Unbilled entries"
          value={`₹${inr(unbilledValue)}`}
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
              placeholder="Search invoice no., party or company…"
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
                <th className="th">Billed to</th>
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
                <td className="td max-w-[220px] truncate">
                  {billedTo(i)}
                  {i.companyId && (
                    <span className="ml-1.5 rounded bg-navy-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-navy-500">
                      Company
                    </span>
                  )}
                  {i.kind === "other" && (
                    <span className="ml-1.5 rounded bg-gold-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gold-700">
                      Other bill
                    </span>
                  )}
                  {i.kind !== "other" && i.direction === "inward" && (
                    <span className="ml-1.5 rounded bg-navy-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-navy-500">
                      Inward
                    </span>
                  )}
                </td>
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
                  <div className="flex items-center justify-end gap-1 opacity-100 transition lg:opacity-0 lg:group-hover:opacity-100">
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

type BillMode = "party" | "company";
type BillKind = "trip" | "other";

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
  const { parties, companies, entriesFor, entriesForCompany, partyName, companyName } = store;
  const [inv, setInv] = useState<Invoice>(initial);
  const [mode, setMode] = useState<BillMode>(initial.companyId ? "company" : "party");
  const [billKind, setBillKind] = useState<BillKind>(initial.kind === "other" ? "other" : "trip");
  const [direction, setDirection] = useState<Direction>(initial.direction ?? "outward");
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());

  /** Switching direction swaps the whole entry pool, so start the picks over. */
  function switchDirection(next: Direction) {
    if (next === direction) return;
    setDirection(next);
    setExcluded(new Set());
  }

  const set = <K extends keyof Invoice>(k: K, v: Invoice[K]) => setInv((p) => ({ ...p, [k]: v }));

  const billToId = mode === "company" ? inv.companyId : inv.partyId;

  function switchMode(next: BillMode) {
    if (next === mode) return;
    setMode(next);
    setExcluded(new Set());
    setNumberTouched(false);
    setInv((p) => ({
      ...p,
      partyId: next === "party" ? p.partyId : undefined,
      companyId: next === "company" ? p.companyId : undefined,
    }));
  }

  // The number is built from the party's/company's code and the invoice's
  // financial year, so it has to be rebuilt when either changes — unless
  // it's been hand-edited.
  const [numberTouched, setNumberTouched] = useState(!isNew);
  useEffect(() => {
    if (numberTouched || !billToId) return;
    const next =
      mode === "company"
        ? store.nextInvoiceNoForCompany(billToId, inv.date)
        : store.nextInvoiceNo(billToId, inv.date);
    if (next !== inv.invoiceNo) setInv((p) => ({ ...p, invoiceNo: next }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billToId, inv.date, numberTouched, mode]);

  // Inward and outward are billed apart, so only one side of the ledger is
  // ever on the table at a time.
  const candidates: Entry[] = useMemo(() => {
    if (!billToId) return [];
    const pool =
      mode === "company"
        ? entriesForCompany(billToId, inv.fromDate, inv.toDate, isNew ? undefined : inv.id)
        : entriesFor(billToId, inv.fromDate, inv.toDate, isNew ? undefined : inv.id);
    return pool.filter((e) => (e.direction ?? "outward") === direction);
  }, [
    mode,
    billToId,
    inv.fromDate,
    inv.toDate,
    inv.id,
    isNew,
    direction,
    entriesFor,
    entriesForCompany,
  ]);

  const selected = useMemo(
    () => candidates.filter((e) => !excluded.has(e.id)),
    [candidates, excluded]
  );

  const freight = useMemo(
    () =>
      billKind === "other"
        ? round2(inv.freightAmount)
        : round2(selected.reduce((s, e) => s + entryTotal(e), 0)),
    [billKind, inv.freightAmount, selected]
  );

  const gst = inv.gstPaidByParty
    ? 0
    : round2((freight * (num(inv.sgstPercent) + num(inv.cgstPercent))) / 100);
  const total = round2(freight + gst);

  const party = parties.find((p) => p.id === inv.partyId);
  const billedCompany = companies.find((c) => c.id === inv.companyId);
  const billTo = mode === "company" ? billedCompany : party;
  const companyParties = useMemo(
    () => (billedCompany ? parties.filter((p) => p.companyId === billedCompany.id) : []),
    [billedCompany, parties]
  );
  const valid = Boolean(
    billToId && inv.invoiceNo.trim() && (billKind === "other" ? freight > 0 : selected.length)
  );

  async function save() {
    if (!valid) return;
    const linkedIds = billKind === "other" ? [] : selected.map((e) => e.id);
    await store.saveInvoice(
      {
        ...inv,
        invoiceNo: inv.invoiceNo.trim(),
        partyId: mode === "party" ? inv.partyId : undefined,
        companyId: mode === "company" ? inv.companyId : undefined,
        kind: billKind,
        direction,
        entryIds: linkedIds,
        freightAmount: freight,
        total,
      },
      linkedIds
    );
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? "Create invoice" : `Edit invoice ${initial.invoiceNo}`}
      subtitle={
        billKind === "other"
          ? "A standalone charge — enter an amount, no trip entries needed."
          : "Entries in the date range are pulled in automatically. Untick anything you want to leave out."
      }
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
          <Field
            label="Invoice no."
            required
            hint={
              numberTouched
                ? "Edited by hand"
                : billToId
                  ? `Built from the ${mode === "company" ? "company" : "party"} code + year`
                  : `Pick a ${mode} to number it`
            }
          >
            <Input
              value={inv.invoiceNo}
              onChange={(e) => {
                setNumberTouched(true);
                set("invoiceNo", e.target.value);
              }}
              placeholder="CST/MTC/01/26-27"
            />
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

        <Field label="Bill to" required>
          <div className="grid gap-2 sm:grid-cols-[auto_1fr] sm:items-start">
            <div className="inline-flex rounded-lg bg-navy-100 p-1">
              <button
                type="button"
                onClick={() => switchMode("party")}
                className={cx(
                  "rounded-md px-3.5 py-1.5 text-xs font-bold transition",
                  mode === "party" ? "bg-white text-navy-900 shadow-sm" : "text-navy-500"
                )}
              >
                Party
              </button>
              <button
                type="button"
                onClick={() => switchMode("company")}
                className={cx(
                  "rounded-md px-3.5 py-1.5 text-xs font-bold transition",
                  mode === "company" ? "bg-white text-navy-900 shadow-sm" : "text-navy-500"
                )}
                disabled={!companies.length}
                title={companies.length ? undefined : "No companies yet"}
              >
                Company
              </button>
            </div>

            {mode === "party" ? (
              <Combo
                options={parties.map((p) => ({ value: p.id, label: p.name }))}
                value={inv.partyId ?? ""}
                onChange={(v) => set("partyId", v)}
                placeholder="Search parties…"
              />
            ) : (
              <Combo
                options={companies.map((c) => ({ value: c.id, label: c.name, hint: c.code }))}
                value={inv.companyId ?? ""}
                onChange={(v) => set("companyId", v)}
                placeholder="Search companies…"
              />
            )}
          </div>
        </Field>

        {billTo && (
          <div className="rounded-lg border border-navy-200 bg-navy-50/50 px-4 py-3 text-sm">
            <p className="font-bold text-navy-900">{billTo.name}</p>
            {billTo.address && (
              <p className="whitespace-pre-line text-navy-600">{billTo.address}</p>
            )}
            {billTo.gstin && (
              <p className="mt-1 font-mono text-xs text-navy-500">GSTIN: {billTo.gstin}</p>
            )}
            {mode === "company" && (
              <p className="mt-2 text-xs text-navy-500">
                Pulls entries from{" "}
                {companyParties.length === 0
                  ? "no parties yet"
                  : companyParties.map((p) => p.name).join(", ")}
                .
              </p>
            )}
          </div>
        )}

        {/* Invoice type + direction */}
        <div className="flex flex-wrap gap-5">
          <Field label="Invoice type">
            <div className="inline-flex w-fit rounded-lg bg-navy-100 p-1">
              <button
                type="button"
                onClick={() => setBillKind("trip")}
                className={cx(
                  "rounded-md px-3.5 py-1.5 text-xs font-bold transition",
                  billKind === "trip" ? "bg-white text-navy-900 shadow-sm" : "text-navy-500"
                )}
              >
                Trip invoice
              </button>
              <button
                type="button"
                onClick={() => setBillKind("other")}
                className={cx(
                  "rounded-md px-3.5 py-1.5 text-xs font-bold transition",
                  billKind === "other" ? "bg-white text-navy-900 shadow-sm" : "text-navy-500"
                )}
              >
                Other bill
              </button>
            </div>
          </Field>

          {billKind === "trip" && (
            <Field
              label="Direction"
              hint="Inward and outward never share a bill"
            >
              <div className="inline-flex w-fit rounded-lg bg-navy-100 p-1">
                <button
                  type="button"
                  onClick={() => switchDirection("outward")}
                  className={cx(
                    "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-bold transition",
                    direction === "outward" ? "bg-white text-navy-900 shadow-sm" : "text-navy-500"
                  )}
                >
                  <ArrowUpRight size={13} /> Outward
                </button>
                <button
                  type="button"
                  onClick={() => switchDirection("inward")}
                  className={cx(
                    "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-bold transition",
                    direction === "inward" ? "bg-white text-navy-900 shadow-sm" : "text-navy-500"
                  )}
                >
                  <ArrowDownLeft size={13} /> Inward
                </button>
              </div>
            </Field>
          )}
        </div>

        {billKind === "other" ? (
          <div className="rounded-xl border border-navy-200 p-4">
            <h3 className="text-sm font-bold text-navy-900">Other billing</h3>
            <p className="mt-0.5 text-xs text-navy-500">
              A standalone charge, not tied to any trip entries — prints as "OTHER BILLING" with
              just the amount.
            </p>
            <div className="mt-3 max-w-[220px]">
              <Field label="Amount" required>
                <Input
                  type="number"
                  step="0.01"
                  value={inv.freightAmount || ""}
                  onChange={(e) => set("freightAmount", num(e.target.value))}
                  placeholder="0.00"
                  className="font-semibold"
                />
              </Field>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-navy-200">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-100 px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-navy-900">
                  {direction === "inward" ? "Inward" : "Outward"} entries in range ·{" "}
                  {selected.length} of {candidates.length}
                </h3>
                <p className="text-xs text-navy-500">
                  Only unbilled {direction} entries appear here.
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

            {!billToId ? (
              <p className="px-4 py-8 text-center text-sm text-navy-400">
                Choose a {mode} to see its entries.
              </p>
            ) : candidates.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-navy-400">
                No unbilled {direction} entries for{" "}
                {mode === "company" ? companyName(billToId) : partyName(billToId)} between{" "}
                {fmtDate(inv.fromDate)} and {fmtDate(inv.toDate)}.
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                <Table
                  head={
                    <>
                      <th className="th w-10"></th>
                      <th className="th">Date</th>
                      {mode === "company" && <th className="th">Party</th>}
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
                        {mode === "company" && (
                          <td className="td max-w-[160px] truncate text-xs text-navy-500">
                            {partyName(e.partyId)}
                          </td>
                        )}
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
        )}

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
              {billKind === "other"
                ? `Other billing · ${fmtDate(inv.date)}`
                : `${selected.length} ${selected.length === 1 ? "entry" : "entries"} · ${fmtDate(inv.fromDate)} to ${fmtDate(inv.toDate)}`}
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
