"use client";

import { useMemo, useRef, useState } from "react";
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
  Clock,
  Upload,
} from "lucide-react";
import type { Entry } from "@/lib/types";
import { useStore } from "@/lib/store";
import { useAccess } from "@/lib/access";
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
  Combo,
  Stat,
  Table,
  cx,
} from "@/components/ui";
import { EntryForm, blankEntry } from "@/components/EntryForm";
import { PhotoStrip } from "@/components/PhotoLines";
import { downloadCsv } from "@/lib/csv";
import { buildImportPlan, type ImportPlan } from "@/lib/entryImport";
import { netByDirection } from "@/lib/report";

export default function EntriesPage() {
  const store = useStore();
  const access = useAccess();
  const { entries, parties, drivers, partyName, driverName } = store;

  // Staff record trips; they don't get the earnings picture, and they can't
  // quietly rewrite an entry once it's in — that goes to the owner first.
  const isOwner = access.isOwner;

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
  const [original, setOriginal] = useState<Entry | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Entry | null>(null);
  const [photos, setPhotos] = useState<Entry | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

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

  const net = useMemo(() => netByDirection(filtered), [filtered]);

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
    setOriginal(null);
    setIsNew(true);
  }

  function openEdit(e: Entry) {
    const normalised = {
      ...e,
      driverExpenses: e.driverExpenses ?? [],
      vehicleExpenses: e.vehicleExpenses ?? [],
      photos: e.photos ?? [],
    };
    setDraft(normalised);
    setOriginal(normalised);
    setIsNew(false);
  }

  const valid = Boolean(draft?.partyId && draft?.date && draft?.invoiceNo && draft?.vehicleNo);

  const describe = (e: Entry) =>
    `Entry ${e.invoiceNo} · ${fmtDate(e.date)} · ${partyName(e.partyId)} · ${e.vehicleNo}`;

  function flash(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(null), 4000);
  }

  async function save() {
    if (!draft || !valid) return;

    // A new entry goes straight in — it's the edit afterwards that needs a
    // second pair of eyes.
    // The store logs the save itself, so staff work lands in the audit trail
    // wherever it happens.
    if (isOwner || isNew) {
      await store.saveEntry(draft);
      setDraft(null);
      return;
    }

    await access.requestEntryChange("update", draft, original ?? undefined, describe(draft));
    setDraft(null);
    flash("Sent to the owner for approval. The entry stays as it was until then.");
  }

  /** Reads the chosen file and works out what it would do, before doing it. */
  async function readImport(file?: File) {
    if (!file) return;
    setImportError(null);
    try {
      const text = await file.text();
      setPlan(buildImportPlan(text, { entries, parties, drivers }));
    } catch (e: any) {
      setImportError(e?.message ?? String(e));
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  }

  async function applyImport() {
    if (!plan) return;
    setImporting(true);
    setImportError(null);
    try {
      await store.importEntries({
        entries: [...plan.added, ...plan.updated.map((u) => u.next)],
        parties: plan.newParties,
        drivers: plan.newDrivers,
      });
      const bits = [
        plan.added.length && `${plan.added.length} added`,
        plan.updated.length && `${plan.updated.length} updated`,
        plan.newParties.length && `${plan.newParties.length} new ${plan.newParties.length === 1 ? "party" : "parties"}`,
        plan.newDrivers.length && `${plan.newDrivers.length} new ${plan.newDrivers.length === 1 ? "driver" : "drivers"}`,
      ].filter(Boolean);
      setPlan(null);
      flash(`Imported — ${bits.join(", ")}.`);
    } catch (e: any) {
      setImportError(e?.message ?? String(e));
    } finally {
      setImporting(false);
    }
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
            {isOwner && (
              <>
                <button onClick={() => importRef.current?.click()} className="btn-ghost">
                  <Upload size={16} /> Import
                </button>
                <button onClick={exportCsv} className="btn-ghost" disabled={!filtered.length}>
                  <Download size={16} /> Export
                </button>
              </>
            )}
            <button onClick={openNew} className="btn-primary" disabled={!parties.length}>
              <Plus size={16} /> New entry
            </button>
          </>
        }
      />

      <input
        ref={importRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => readImport(e.target.files?.[0])}
      />

      {notice && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-gold-300 bg-gold-50 px-4 py-3 text-sm font-semibold text-gold-900">
          <Clock size={16} className="mt-0.5 shrink-0" />
          {notice}
        </div>
      )}

      {!parties.length && (
        <div className="mb-5 rounded-xl border border-gold-300 bg-gold-50 px-4 py-3 text-sm text-gold-900">
          Add a party first &mdash; every entry is billed to one.{" "}
          <Link href="/parties" className="font-bold underline">
            Go to Parties
          </Link>
        </div>
      )}

      {/* The money tiles are the owner's business, not the entry clerk's. */}
      <div
        className={cx(
          "stagger mb-5 grid gap-3 sm:gap-4",
          isOwner ? "grid-cols-2 lg:grid-cols-5" : "grid-cols-2"
        )}
      >
        <Stat label="Entries" value={filtered.length} sub={`${totals.billedCount} invoiced`} />
        {isOwner ? (
          <>
            <Stat label="Billed" value={`₹${inr(totals.billed)}`} tone="gold" />
            <Stat label="Expenses" value={`₹${inr(totals.vehicleExp + totals.driverExp)}`} tone="red" />
            {/* Inward and outward are kept apart — netting one against the
                other hides which side of the business is actually earning. */}
            <Stat
              label="Outward net"
              value={`₹${inr(net.outward)}`}
              tone={net.outward >= 0 ? "green" : "red"}
            />
            <Stat
              label="Inward net"
              value={`₹${inr(net.inward)}`}
              tone={net.inward >= 0 ? "green" : "red"}
              sub={`${totals.qty.toFixed(3)} total qty`}
            />
          </>
        ) : (
          <Stat label="Total qty" value={totals.qty.toFixed(3)} />
        )}
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

        {/* Inward / outward is the split that matters most, so it gets its own
            control rather than hiding among the dropdowns. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-navy-100 px-4 pt-4">
          {[
            { key: "", label: "All", icon: null },
            { key: "outward", label: "Outward", icon: <ArrowUpRight size={13} /> },
            { key: "inward", label: "Inward", icon: <ArrowDownLeft size={13} /> },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => setDirection(opt.key)}
              aria-pressed={direction === opt.key}
              className={cx(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition",
                direction === opt.key
                  ? "border-navy-800 bg-navy-800 text-white"
                  : "border-navy-200 bg-white text-navy-600 hover:bg-navy-50"
              )}
            >
              {opt.icon}
              {opt.label}
              <span
                className={cx(
                  "tabular rounded px-1 text-[10px]",
                  direction === opt.key ? "bg-white/15" : "bg-navy-100 text-navy-500"
                )}
              >
                {opt.key
                  ? entries.filter((e) => (e.direction ?? "outward") === opt.key).length
                  : entries.length}
              </span>
            </button>
          ))}
        </div>

        <div className="grid gap-3 border-b border-navy-100 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="From" hint={from ? undefined : "any date"}>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To" hint={to ? undefined : "any date"}>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="Party">
            <Combo
              options={[
                { value: "", label: "All parties" },
                ...parties.map((p) => ({ value: p.id, label: p.name })),
              ]}
              value={partyId}
              onChange={setPartyId}
              placeholder="All parties"
            />
          </Field>
          <Field label="Vehicle">
            <Combo
              options={[
                { value: "", label: "All vehicles" },
                ...store.vehicleNumbers.map((v) => ({ value: v, label: v })),
              ]}
              value={vehicleNo}
              onChange={setVehicleNo}
              placeholder="All vehicles"
            />
          </Field>
          <Field label="Driver">
            <Combo
              options={[
                { value: "", label: "All drivers" },
                ...drivers.map((d) => ({ value: d.id, label: d.name })),
              ]}
              value={driverId}
              onChange={setDriverId}
              placeholder="All drivers"
            />
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
                <th className="th">Type</th>
                <th className="th">Inv. No</th>
                <th className="th">Party</th>
                <th className="th">Vehicle</th>
                <th className="th">Driver</th>
                <th className="th text-right">Qty</th>
                <th className="th text-right">Billed</th>
                <th className="th text-right">Veh. exp</th>
                <th className="th text-right">Drv. exp</th>
                {/* What the trip actually made is the owner's to see. */}
                {isOwner && <th className="th text-right">Net</th>}
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
                  <td className="td">{fmtDate(e.date)}</td>
                  <td className="td">
                    {e.direction === "inward" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-navy-100 px-2 py-0.5 text-[11px] font-bold text-navy-700">
                        <ArrowDownLeft size={12} /> Inward
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                        <ArrowUpRight size={12} /> Outward
                      </span>
                    )}
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
                  {isOwner && (
                    <td
                      className={cx(
                        "td tabular text-right font-bold",
                        net >= 0 ? "text-emerald-700" : "text-red-600"
                      )}
                    >
                      {inr(net)}
                    </td>
                  )}
                  <td className="td">
                    {access.pendingEntryIds.has(e.id) ? (
                      <Chip tone="gold">Awaiting approval</Chip>
                    ) : e.invoiceId ? (
                      <Chip tone="green">Billed</Chip>
                    ) : (
                      <Chip tone="slate">Open</Chip>
                    )}
                  </td>
                  <td className="td">
                    <div className="flex items-center justify-end gap-1 opacity-100 transition lg:opacity-0 lg:group-hover:opacity-100">
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
            {isOwner && (
              <tr className="bg-navy-50 font-bold">
                <td className="td" colSpan={7}>
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
            )}
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
              {isNew ? "Save entry" : isOwner ? "Save changes" : "Send for approval"}
            </button>
          </>
        }
      >
        {!isOwner && !isNew && (
          <p className="mb-4 rounded-lg bg-gold-50 px-3 py-2 text-xs font-semibold text-gold-900">
            Changes to an entry you&apos;ve already saved go to the owner for approval. The entry
            stays as it is until they accept it.
          </p>
        )}
        {draft && <EntryForm value={draft} onChange={setDraft} />}
      </Modal>

      {/* Import preview — nothing is written until this is confirmed. */}
      <Modal
        open={!!plan}
        onClose={() => setPlan(null)}
        title="Import entries"
        subtitle={plan ? `${plan.totalRows} rows read from the file` : undefined}
        wide
        footer={
          <>
            <button className="btn-ghost" onClick={() => setPlan(null)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={applyImport}
              disabled={importing || !plan || (!plan.added.length && !plan.updated.length)}
            >
              {importing
                ? "Importing…"
                : plan
                  ? `Import ${plan.added.length + plan.updated.length} entries`
                  : "Import"}
            </button>
          </>
        }
      >
        {plan && (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="New entries" value={plan.added.length} tone="green" />
              <Stat label="Will overwrite" value={plan.updated.length} tone="gold" />
              <Stat label="New parties" value={plan.newParties.length} />
              <Stat label="New drivers" value={plan.newDrivers.length} />
            </div>

            {plan.updated.length > 0 && (
              <p className="rounded-lg bg-gold-50 px-3 py-2 text-xs text-gold-900">
                <strong>{plan.updated.length}</strong>{" "}
                {plan.updated.length === 1 ? "row matches an entry" : "rows match entries"} already
                recorded — same date, invoice no. and vehicle. Importing replaces{" "}
                {plan.updated.length === 1 ? "it" : "them"} with what the file says. Whatever
                invoice they sit on is kept.
              </p>
            )}

            {(plan.newParties.length > 0 || plan.newDrivers.length > 0) && (
              <p className="text-xs text-navy-600">
                Names not on file yet will be created:{" "}
                <strong>
                  {[...plan.newParties.map((p) => p.name), ...plan.newDrivers.map((d) => d.name)]
                    .slice(0, 8)
                    .join(", ")}
                </strong>
                {plan.newParties.length + plan.newDrivers.length > 8 && " and more"}.
              </p>
            )}

            {plan.hasExpenseTotals && (
              <p className="text-xs text-navy-500">
                The file carries expense totals rather than the individual costs, so each one comes
                in as a single line named &ldquo;Imported&rdquo;.
              </p>
            )}

            {plan.hadInvoiced && (
              <p className="text-xs text-navy-500">
                Rows marked as invoiced can&apos;t be reconnected to their bill from a file — new
                entries arrive unbilled.
              </p>
            )}

            {plan.problems.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-xs font-bold text-red-700">
                  {plan.problems.length} {plan.problems.length === 1 ? "row" : "rows"} skipped
                </p>
                <ul className="mt-1.5 grid gap-1">
                  {plan.problems.slice(0, 10).map((p, i) => (
                    <li key={i} className="text-xs text-red-700">
                      {p.row ? `Row ${p.row}: ` : ""}
                      {p.message}
                    </li>
                  ))}
                  {plan.problems.length > 10 && (
                    <li className="text-xs text-red-600">
                      …and {plan.problems.length - 10} more.
                    </li>
                  )}
                </ul>
              </div>
            )}

            {plan.added.length + plan.updated.length > 0 && (
              <div className="rounded-lg border border-navy-200">
                <p className="border-b border-navy-100 px-3 py-2 text-xs font-bold text-navy-600">
                  First few rows
                </p>
                <div className="max-h-56 overflow-y-auto">
                  <Table
                    head={
                      <>
                        <th className="th">Date</th>
                        <th className="th">Inv. No</th>
                        <th className="th">Party</th>
                        <th className="th">Vehicle</th>
                        <th className="th text-right">Amount</th>
                        <th className="th"></th>
                      </>
                    }
                  >
                    {[
                      ...plan.added.map((e) => ({ e, kind: "new" as const })),
                      ...plan.updated.map((u) => ({ e: u.next, kind: "update" as const })),
                    ]
                      .slice(0, 20)
                      .map(({ e, kind }) => (
                        <tr key={e.id}>
                          <td className="td">{fmtDate(e.date)}</td>
                          <td className="td font-semibold">{e.invoiceNo || "—"}</td>
                          <td className="td max-w-[160px] truncate">{partyName(e.partyId)}</td>
                          <td className="td font-mono text-xs">{e.vehicleNo}</td>
                          <td className="td tabular text-right">{inr(entryTotal(e))}</td>
                          <td className="td">
                            {kind === "new" ? (
                              <Chip tone="green">New</Chip>
                            ) : (
                              <Chip tone="gold">Replaces</Chip>
                            )}
                          </td>
                        </tr>
                      ))}
                  </Table>
                </div>
              </div>
            )}

            {importError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                {importError}
              </p>
            )}
          </div>
        )}
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
        title={isOwner ? "Delete this entry?" : "Ask to delete this entry?"}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </button>
            <button
              className="btn-danger"
              onClick={async () => {
                if (!confirmDelete) return;
                if (isOwner) {
                  await store.deleteEntry(confirmDelete.id);
                } else {
                  await access.requestEntryChange(
                    "delete",
                    confirmDelete,
                    confirmDelete,
                    describe(confirmDelete)
                  );
                  flash("Delete request sent to the owner. The entry stays until they accept it.");
                }
                setConfirmDelete(null);
              }}
            >
              {isOwner ? "Delete" : "Send request"}
            </button>
          </>
        }
      >
        <p className="text-sm text-navy-600">
          Entry <strong>{confirmDelete?.invoiceNo}</strong> dated{" "}
          <strong>{fmtDate(confirmDelete?.date)}</strong> for{" "}
          <strong>{partyName(confirmDelete?.partyId)}</strong>
          {isOwner
            ? " will be removed. This cannot be undone."
            : " will only be removed once the owner approves it."}
        </p>
        {confirmDelete?.invoiceId && isOwner && (
          <p className="mt-3 rounded-lg bg-gold-50 px-3 py-2 text-sm text-gold-900">
            This entry is on an invoice. That invoice will be re-totalled without it.
          </p>
        )}
      </Modal>
    </>
  );
}
