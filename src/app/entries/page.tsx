"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  ClipboardList,
  Download,
  Image as ImageIcon,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";
import type { Entry } from "@/lib/types";
import { useStore } from "@/lib/store";
import {
  entryExpenses,
  entryTotal,
  fmtDate,
  inr,
  inrShort,
  startOfMonth,
  today,
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
} from "@/components/ui";
import { EntryForm, blankEntry } from "@/components/EntryForm";
import { downloadCsv } from "@/lib/csv";

export default function EntriesPage() {
  const store = useStore();
  const { entries, parties, drivers, partyName, driverName } = store;

  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [partyId, setPartyId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [direction, setDirection] = useState("");
  const [q, setQ] = useState("");

  const [draft, setDraft] = useState<Entry | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Entry | null>(null);
  const [photo, setPhoto] = useState<Entry | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries
      .filter((e) => e.date >= from && e.date <= to)
      .filter((e) => !partyId || e.partyId === partyId)
      .filter((e) => !driverId || e.driverId === driverId)
      .filter((e) => !direction || e.direction === direction)
      .filter((e) => {
        if (!needle) return true;
        return [e.invoiceNo, e.vehicleNo, partyName(e.partyId), driverName(e.driverId), e.remarks]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [entries, from, to, partyId, driverId, direction, q, partyName, driverName]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, e) => {
          acc.amount += entryTotal(e);
          acc.expenses += entryExpenses(e);
          acc.qty += e.qty || 0;
          if (e.invoiceId) acc.billed += 1;
          return acc;
        },
        { amount: 0, expenses: 0, qty: 0, billed: 0 }
      ),
    [filtered]
  );

  function openNew() {
    setDraft(blankEntry(store.nextEntryInvoiceNo()));
    setIsNew(true);
  }

  function openEdit(e: Entry) {
    setDraft({ ...e, expenses: e.expenses ?? [] });
    setIsNew(false);
  }

  const valid = Boolean(draft?.partyId && draft?.date && draft?.invoiceNo && draft?.vehicleNo);

  async function save() {
    if (!draft || !valid) return;
    await store.saveEntry(draft);
    setDraft(null);
  }

  function exportCsv() {
    downloadCsv(
      [
        [
          "Date",
          "Invoice No",
          "Direction",
          "Party",
          "Driver",
          "Vehicle",
          "Qty",
          "Rate",
          "Amount",
          "Detention",
          "Total",
          "Expenses",
          "Billed",
        ],
        ...filtered.map((e) => [
          fmtDate(e.date),
          e.invoiceNo,
          e.direction,
          partyName(e.partyId),
          driverName(e.driverId),
          e.vehicleNo,
          e.qty,
          e.rate,
          e.amount,
          e.detention ?? 0,
          entryTotal(e),
          entryExpenses(e),
          e.invoiceId ? "Yes" : "No",
        ]),
      ],
      `entries-${from}-to-${to}.csv`
    );
  }

  return (
    <>
      <PageHeader
        title="Entries"
        subtitle="Every trip you send or receive. Detention adds straight onto the entry total."
        actions={
          <>
            <button onClick={exportCsv} className="btn-ghost" disabled={!filtered.length}>
              <Download size={16} /> Export
            </button>
            <button onClick={openNew} className="btn-primary" disabled={!parties.length}>
              <Plus size={16} /> New entry
            </button>
          </>
        }
      />

      {!parties.length && (
        <div className="mb-5 rounded-xl border border-gold-300 bg-gold-50 px-4 py-3 text-sm text-gold-900">
          Add a party first &mdash; every entry is billed to one.{" "}
          <Link href="/parties" className="font-bold underline">
            Go to Parties
          </Link>
        </div>
      )}

      <div className="stagger mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Entries" value={filtered.length} sub={`${totals.billed} already billed`} />
        <Stat label="Billable total" value={`₹${inrShort(totals.amount)}`} tone="gold" />
        <Stat label="Driver expenses" value={`₹${inrShort(totals.expenses)}`} tone="red" />
        <Stat
          label="Net"
          value={`₹${inrShort(totals.amount - totals.expenses)}`}
          tone="green"
          sub={`${totals.qty.toFixed(3)} total qty`}
        />
      </div>

      <Card bodyClassName="p-0">
        <div className="grid gap-3 border-b border-navy-100 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="Party">
            <Select value={partyId} onChange={(e) => setPartyId(e.target.value)}>
              <option value="">All parties</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Driver">
            <Select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
              <option value="">All drivers</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Direction">
            <Select value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="">Both</option>
              <option value="outward">Outward</option>
              <option value="inward">Inward</option>
            </Select>
          </Field>
          <Field label="Search">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Invoice, vehicle..."
                className="pl-9"
              />
            </div>
          </Field>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={32} />}
            title="No entries in this range"
            message="Adjust the filters, or record the first trip for this period."
            action={
              parties.length ? (
                <button onClick={openNew} className="btn-primary">
                  <Plus size={16} /> New entry
                </button>
              ) : undefined
            }
          />
        ) : (
          <Table
            head={
              <>
                <th className="th">Date</th>
                <th className="th">Inv. No</th>
                <th className="th">Party</th>
                <th className="th">Vehicle</th>
                <th className="th">Driver</th>
                <th className="th text-right">Qty</th>
                <th className="th text-right">Rate</th>
                <th className="th text-right">Amount</th>
                <th className="th text-right">Detention</th>
                <th className="th text-right">Total</th>
                <th className="th text-right">Exp.</th>
                <th className="th">Status</th>
                <th className="th"></th>
              </>
            }
          >
            {filtered.map((e) => (
              <tr key={e.id} className="group transition hover:bg-navy-50/60">
                <td className="td">
                  <div className="flex items-center gap-2">
                    {e.direction === "outward" ? (
                      <ArrowUpRight size={14} className="text-emerald-600" />
                    ) : (
                      <ArrowDownLeft size={14} className="text-navy-500" />
                    )}
                    {fmtDate(e.date)}
                  </div>
                </td>
                <td className="td font-semibold">{e.invoiceNo}</td>
                <td className="td max-w-[200px] truncate">{partyName(e.partyId)}</td>
                <td className="td font-mono text-xs">{e.vehicleNo}</td>
                <td className="td">{driverName(e.driverId)}</td>
                <td className="td tabular text-right">{e.qty ? e.qty.toFixed(3) : "—"}</td>
                <td className="td tabular text-right">{e.rate ? inr(e.rate) : "—"}</td>
                <td className="td tabular text-right">{inr(e.amount)}</td>
                <td className="td tabular text-right">
                  {e.detention ? (
                    <span className="font-semibold text-gold-700">{inr(e.detention)}</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="td tabular text-right font-bold">{inr(entryTotal(e))}</td>
                <td className="td tabular text-right text-red-600">
                  {entryExpenses(e) ? inr(entryExpenses(e)) : "—"}
                </td>
                <td className="td">
                  {e.invoiceId ? <Chip tone="green">Billed</Chip> : <Chip tone="slate">Open</Chip>}
                </td>
                <td className="td">
                  <div className="flex items-center justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                    {e.ackPhoto && (
                      <button
                        onClick={() => setPhoto(e)}
                        className="rounded-lg p-1.5 text-navy-500 hover:bg-navy-100"
                        title="Acknowledgment photo"
                      >
                        <ImageIcon size={15} />
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(e)}
                      className="rounded-lg p-1.5 text-navy-500 hover:bg-navy-100"
                      title="Edit"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(e)}
                      className="rounded-lg p-1.5 text-navy-400 hover:bg-red-50 hover:text-red-600"
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            <tr className="bg-navy-50 font-bold">
              <td className="td" colSpan={9}>
                {filtered.length} entries
              </td>
              <td className="td tabular text-right">{"₹"}{inr(totals.amount)}</td>
              <td className="td tabular text-right text-red-600">
                {"₹"}{inr(totals.expenses)}
              </td>
              <td className="td" colSpan={2}></td>
            </tr>
          </Table>
        )}
      </Card>

      {/* Create / edit */}
      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={isNew ? "New entry" : "Edit entry"}
        subtitle={isNew ? "Record a trip" : `Invoice ${draft?.invoiceNo}`}
        wide
        footer={
          <>
            <button className="btn-ghost" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save} disabled={!valid}>
              {isNew ? "Save entry" : "Save changes"}
            </button>
          </>
        }
      >
        {draft && <EntryForm value={draft} onChange={setDraft} />}
      </Modal>

      {/* Photo */}
      <Modal
        open={!!photo}
        onClose={() => setPhoto(null)}
        title="Acknowledgment photo"
        subtitle={photo ? `${photo.invoiceNo} - ${fmtDate(photo.date)}` : undefined}
      >
        {photo?.ackPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.ackPhoto} alt="Acknowledgment" className="w-full rounded-lg" />
        )}
      </Modal>

      {/* Delete */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete this entry?"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </button>
            <button
              className="btn-danger"
              onClick={async () => {
                if (confirmDelete) await store.deleteEntry(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm text-navy-600">
          Entry <strong>{confirmDelete?.invoiceNo}</strong> dated{" "}
          <strong>{fmtDate(confirmDelete?.date)}</strong> for{" "}
          <strong>{partyName(confirmDelete?.partyId)}</strong> will be removed. This cannot be
          undone.
        </p>
        {confirmDelete?.invoiceId && (
          <p className="mt-3 rounded-lg bg-gold-50 px-3 py-2 text-sm text-gold-900">
            This entry is already on an invoice. Deleting it will change that invoice&apos;s total.
          </p>
        )}
      </Modal>
    </>
  );
}
