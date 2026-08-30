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
  Images,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";
import type { Entry } from "@/lib/types";
import { useStore } from "@/lib/store";
import {
  entryDriverExpenses,
  entryNet,
  entryTotal,
  entryVehicleExpenses,
  fmtDate,
  inr,
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
  cx,
} from "@/components/ui";
import { EntryForm, blankEntry } from "@/components/EntryForm";
import { PhotoStrip } from "@/components/PhotoLines";
import { downloadCsv } from "@/lib/csv";

export default function EntriesPage() {
  const store = useStore();
  const { entries, parties, drivers, partyName, driverName } = store;

  // Empty = unbounded. Default to showing everything, so no entry is ever
  // hidden just because it falls outside a date window the user didn't set.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [partyId, setPartyId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [direction, setDirection] = useState("");
  const [q, setQ] = useState("");

  const [draft, setDraft] = useState<Entry | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Entry | null>(null);
  const [photos, setPhotos] = useState<Entry | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries
      .filter((e) => (!from || e.date >= from) && (!to || e.date <= to))
      .filter((e) => !partyId || e.partyId === partyId)
      .filter((e) => !driverId || e.driverId === driverId)
      .filter((e) => !vehicleNo || e.vehicleNo === vehicleNo)
      .filter((e) => !direction || e.direction === direction)
      .filter((e) => {
        if (!needle) return true;
        return [
          e.invoiceNo,
          e.vehicleNo,
          e.consignee,
          partyName(e.partyId),
          driverName(e.driverId),
          e.remarks,
        ]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [entries, from, to, partyId, driverId, vehicleNo, direction, q, partyName, driverName]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, e) => {
          acc.billed += entryTotal(e);
          acc.vehicleExp += entryVehicleExpenses(e);
          acc.driverExp += entryDriverExpenses(e);
          acc.net += entryNet(e);
          acc.qty += e.qty || 0;
          if (e.invoiceId) acc.billedCount += 1;
          return acc;
        },
        { billed: 0, vehicleExp: 0, driverExp: 0, net: 0, qty: 0, billedCount: 0 }
      ),
    [filtered]
  );

  /** How many of the user's entries the current filters are hiding. */
  const hiddenCount = entries.length - filtered.length;

  function clearFilters() {
    setFrom("");
    setTo("");
    setPartyId("");
    setDriverId("");
    setVehicleNo("");
    setDirection("");
    setQ("");
  }

  function openNew() {
    setDraft(blankEntry(store.nextEntryInvoiceNo()));
    setIsNew(true);
  }

  function openEdit(e: Entry) {
    setDraft({
      ...e,
      driverExpenses: e.driverExpenses ?? [],
      vehicleExpenses: e.vehicleExpenses ?? [],
      photos: e.photos ?? [],
    });
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
          "Delivered to",
          "Driver",
          "Vehicle",
          "Qty",
          "Rate",
          "Amount",
          "Detention",
          "Billed",
          "Vehicle expenses",
          "Driver expenses",
          "Net",
          "Invoiced",
        ],
        ...filtered.map((e) => [
          fmtDate(e.date),
          e.invoiceNo,
          e.direction,
          partyName(e.partyId),
          e.consignee ?? "",
          driverName(e.driverId),
          e.vehicleNo,
          e.qty,
          e.rate,
          e.amount,
          e.detention ?? 0,
          entryTotal(e),
          entryVehicleExpenses(e),
          entryDriverExpenses(e),
          entryNet(e),
          e.invoiceId ? "Yes" : "No",
        ]),
      ],
      `entries-${from || "all"}-to-${to || "all"}.csv`
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

      <div className="stagger mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <Stat label="Entries" value={filtered.length} sub={`${totals.billedCount} invoiced`} />
        <Stat label="Billed" value={`₹${inr(totals.billed)}`} tone="gold" />
        <Stat label="Vehicle expenses" value={`₹${inr(totals.vehicleExp)}`} tone="red" />
        <Stat label="Driver expenses" value={`₹${inr(totals.driverExp)}`} tone="red" />
        <Stat
          label="Net"
          value={`₹${inr(totals.net)}`}
          tone={totals.net >= 0 ? "green" : "red"}
          sub={`${totals.qty.toFixed(3)} total qty`}
        />
      </div>

      <Card bodyClassName="p-0">
        {/* Only surfaced when filters are actually hiding something. */}
        {hiddenCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-100 bg-gold-50 px-4 py-2">
            <span className="text-xs font-semibold text-gold-900">
              {hiddenCount} {hiddenCount === 1 ? "entry is" : "entries are"} hidden by the filters
              below.
            </span>
            <button onClick={clearFilters} className="btn-ghost btn-sm">
              Clear filters
            </button>
          </div>
        )}

        <div className="grid gap-3 border-b border-navy-100 p-4 sm:grid-cols-2 lg:grid-cols-7">
          <Field label="From" hint={from ? undefined : "any date"}>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To" hint={to ? undefined : "any date"}>
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
          <Field label="Vehicle">
            <Select value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)}>
              <option value="">All vehicles</option>
              {store.vehicleNumbers.map((v) => (
                <option key={v} value={v}>
                  {v}
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
            title="No entries match"
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
                <th className="th text-right">Billed</th>
                <th className="th text-right">Veh. exp</th>
                <th className="th text-right">Drv. exp</th>
                <th className="th text-right">Net</th>
                <th className="th">Status</th>
                <th className="th"></th>
              </>
            }
          >
            {filtered.map((e) => {
              const net = entryNet(e);
              const vExp = entryVehicleExpenses(e);
              const dExp = entryDriverExpenses(e);
              return (
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
                  <td className="td max-w-[180px] truncate">{partyName(e.partyId)}</td>
                  <td className="td font-mono text-xs">{e.vehicleNo}</td>
                  <td className="td">{driverName(e.driverId)}</td>
                  <td className="td tabular text-right">{e.qty ? e.qty.toFixed(3) : "—"}</td>
                  <td className="td tabular text-right font-semibold">
                    {inr(entryTotal(e))}
                    {e.detention ? (
                      <span className="block text-[10px] font-semibold text-gold-700">
                        incl. {inr(e.detention)} det.
                      </span>
                    ) : null}
                  </td>
                  <td className="td tabular text-right text-red-600">{vExp ? inr(vExp) : "—"}</td>
                  <td className="td tabular text-right text-red-600">{dExp ? inr(dExp) : "—"}</td>
                  <td
                    className={cx(
                      "td tabular text-right font-bold",
                      net >= 0 ? "text-emerald-700" : "text-red-600"
                    )}
                  >
                    {inr(net)}
                  </td>
                  <td className="td">
                    {e.invoiceId ? <Chip tone="green">Billed</Chip> : <Chip tone="slate">Open</Chip>}
                  </td>
                  <td className="td">
                    <div className="flex items-center justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                      {(e.photos ?? []).length > 0 && (
                        <button
                          onClick={() => setPhotos(e)}
                          className="relative rounded-lg p-1.5 text-navy-500 hover:bg-navy-100"
                          title={`${e.photos.length} photo(s)`}
                        >
                          <Images size={15} />
                          <span className="absolute -right-0.5 -top-0.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-navy-800 text-[9px] font-bold text-white">
                            {e.photos.length}
                          </span>
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
              );
            })}
            <tr className="bg-navy-50 font-bold">
              <td className="td" colSpan={6}>
                {filtered.length} entries
              </td>
              <td className="td tabular text-right">₹{inr(totals.billed)}</td>
              <td className="td tabular text-right text-red-600">₹{inr(totals.vehicleExp)}</td>
              <td className="td tabular text-right text-red-600">₹{inr(totals.driverExp)}</td>
              <td
                className={cx(
                  "td tabular text-right",
                  totals.net >= 0 ? "text-emerald-700" : "text-red-600"
                )}
              >
                ₹{inr(totals.net)}
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

      {/* Photos */}
      <Modal
        open={!!photos}
        onClose={() => setPhotos(null)}
        title="Photos"
        subtitle={photos ? `${photos.invoiceNo} · ${fmtDate(photos.date)}` : undefined}
        wide
      >
        {photos && <PhotoStrip photos={photos.photos ?? []} />}
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
            This entry is on an invoice. That invoice will be re-totalled without it.
          </p>
        )}
      </Modal>
    </>
  );
}
