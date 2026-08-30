"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Trash2, Download, FileWarning } from "lucide-react";
import type { Driver } from "@/lib/types";
import { useStore } from "@/lib/store";
import {
  entryExpenses,
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
  Stat,
  Table,
} from "@/components/ui";
import { DriverForm } from "@/components/DriverForm";
import { downloadCsv } from "@/lib/csv";

const DOC_LABELS: { key: keyof NonNullable<Driver["docs"]>; label: string }[] = [
  { key: "pan", label: "PAN card" },
  { key: "aadhaar", label: "Aadhaar card" },
  { key: "licence", label: "Licence copy" },
  { key: "police", label: "Police verification" },
];

export default function DriverDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const store = useStore();
  const { drivers, entries, partyName, ready } = store;

  const driver = drivers.find((d) => d.id === id);

  // Empty = unbounded, so every trip shows until a range is chosen.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [draft, setDraft] = useState<Driver | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [preview, setPreview] = useState<{ src: string; label: string } | null>(null);

  const allTrips = useMemo(
    () =>
      entries
        .filter((e) => e.driverId === id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [entries, id]
  );

  const trips = useMemo(
    () => allTrips.filter((e) => (!from || e.date >= from) && (!to || e.date <= to)),
    [allTrips, from, to]
  );

  const totals = useMemo(
    () => trips.reduce((a, e) => ({ exp: a.exp + entryExpenses(e) }), { exp: 0 }),
    [trips]
  );

  const lifetimeExp = useMemo(
    () => allTrips.reduce((s, e) => s + entryExpenses(e), 0),
    [allTrips]
  );

  /** Expense totals grouped by label across the selected range. */
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of trips)
      for (const x of e.expenses ?? []) {
        const key = (x.label || "Other").trim() || "Other";
        m.set(key, (m.get(key) ?? 0) + (x.amount || 0));
      }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [trips]);

  if (!ready) return null;

  if (!driver) {
    return (
      <EmptyState
        icon={<FileWarning size={32} />}
        title="Driver not found"
        message="This driver may have been deleted."
        action={
          <Link href="/drivers" className="btn-primary">
            Back to drivers
          </Link>
        }
      />
    );
  }

  const maxCat = byCategory[0]?.[1] ?? 0;

  return (
    <>
      <Link
        href="/drivers"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-navy-500 hover:text-navy-800"
      >
        <ArrowLeft size={15} /> All drivers
      </Link>

      <PageHeader
        title={driver.name}
        subtitle={[driver.phone, driver.address].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            <button onClick={() => setDraft(driver)} className="btn-ghost">
              <Pencil size={16} /> Edit
            </button>
            <button onClick={() => setConfirmDelete(true)} className="btn-danger">
              <Trash2 size={16} /> Delete
            </button>
          </>
        }
      />

      {!driver.active && (
        <div className="mb-5">
          <Chip tone="slate">Inactive driver</Chip>
        </div>
      )}

      <div className="stagger mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <Stat label="Trips in range" value={trips.length} sub={`${allTrips.length} lifetime`} />
        <Stat label="Spent in range" value={`₹${inr(totals.exp)}`} tone="red" />
        <Stat label="Spent lifetime" value={`₹${inr(lifetimeExp)}`} tone="gold" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Details */}
        <div className="grid gap-5 lg:col-span-1">
          <Card title="Details">
            <div className="flex items-start gap-4">
              {driver.docs?.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={driver.docs.photo}
                  alt={driver.name}
                  className="h-20 w-20 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-navy-100 text-xl font-extrabold text-navy-500">
                  {driver.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <dl className="grid flex-1 gap-2 text-sm">
                <Row label="Licence" value={driver.licenceNo} mono />
                <Row label="PAN" value={driver.panNo} mono />
                <Row label="Aadhaar" value={driver.aadhaarNo} mono />
                <Row label="Police verif." value={driver.policeVerification} />
              </dl>
            </div>
            {driver.address && (
              <p className="mt-4 border-t border-navy-100 pt-3 text-sm text-navy-600">
                {driver.address}
              </p>
            )}
            {driver.notes && (
              <p className="mt-2 text-sm text-navy-500 italic">{driver.notes}</p>
            )}
          </Card>

          <Card title="Documents" subtitle="Click any scan to view full size.">
            <div className="grid grid-cols-2 gap-3">
              {DOC_LABELS.map(({ key, label }) => {
                const src = driver.docs?.[key];
                return src ? (
                  <button
                    key={key}
                    onClick={() => setPreview({ src, label })}
                    className="group overflow-hidden rounded-lg border border-navy-200 text-left"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={label}
                      className="aspect-[4/3] w-full object-cover transition group-hover:opacity-90"
                    />
                    <p className="px-2 py-1.5 text-[11px] font-semibold text-navy-700">{label}</p>
                  </button>
                ) : (
                  <div
                    key={key}
                    className="grid aspect-[4/3] place-items-center rounded-lg border border-dashed border-navy-200 bg-navy-50/50 p-2 text-center"
                  >
                    <p className="text-[11px] font-semibold text-navy-400">{label}</p>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="Expenses by type" subtitle="Within the selected date range.">
            {byCategory.length === 0 ? (
              <p className="py-4 text-center text-sm text-navy-400">No expenses in this range.</p>
            ) : (
              <div className="grid gap-2.5">
                {byCategory.map(([label, amt]) => (
                  <div key={label}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-semibold text-navy-700">{label}</span>
                      <span className="tabular font-bold text-navy-900">₹{inr(amt)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-navy-100">
                      <div
                        className="h-full rounded-full bg-gold-500"
                        style={{ width: `${maxCat ? (amt / maxCat) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Trips */}
        <Card
          className="lg:col-span-2"
          title="Trip history"
          subtitle="Every entry attached to this driver, with the expenses on each."
          bodyClassName="p-0"
          actions={
            <button
              className="btn-ghost btn-sm"
              disabled={!trips.length}
              onClick={() =>
                downloadCsv(
                  [
                    ["Date", "Invoice No", "Party", "Vehicle", "Qty", "Expenses"],
                    ...trips.map((e) => [
                      fmtDate(e.date),
                      e.invoiceNo,
                      partyName(e.partyId),
                      e.vehicleNo,
                      e.qty,
                      entryExpenses(e),
                    ]),
                  ],
                  `${driver.name.replace(/\s+/g, "-")}-trips.csv`
                )
              }
            >
              <Download size={14} /> Export
            </button>
          }
        >
          <div className="grid gap-3 border-b border-navy-100 p-4 sm:grid-cols-2">
            <Field label="From">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>

          {trips.length === 0 ? (
            <EmptyState title="No trips in this range" message="Widen the dates to see more." />
          ) : (
            <Table
              head={
                <>
                  <th className="th">Date</th>
                  <th className="th">Inv. No</th>
                  <th className="th">Party</th>
                  <th className="th">Vehicle</th>
                  <th className="th">Expenses</th>
                  <th className="th text-right">Exp. total</th>
                </>
              }
            >
              {trips.map((e) => (
                <tr key={e.id} className="align-top transition hover:bg-navy-50/60">
                  <td className="td">{fmtDate(e.date)}</td>
                  <td className="td font-semibold">{e.invoiceNo}</td>
                  <td className="td max-w-[180px] truncate">{partyName(e.partyId)}</td>
                  <td className="td font-mono text-xs">{e.vehicleNo}</td>
                  <td className="td whitespace-normal">
                    {(e.expenses ?? []).length ? (
                      <div className="flex flex-wrap gap-1">
                        {e.expenses.map((x) => (
                          <span
                            key={x.id}
                            className="rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-medium text-navy-600"
                          >
                            {x.label || "Other"} ₹{inr(x.amount)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-navy-300">—</span>
                    )}
                  </td>
                  <td className="td tabular text-right text-red-600">
                    {entryExpenses(e) ? `₹${inr(entryExpenses(e))}` : "—"}
                  </td>
                </tr>
              ))}
              <tr className="bg-navy-50 font-bold">
                <td className="td" colSpan={5}>
                  {trips.length} trips
                </td>
                <td className="td tabular text-right text-red-600">₹{inr(totals.exp)}</td>
              </tr>
            </Table>
          )}
        </Card>
      </div>

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title="Edit driver"
        wide
        footer={
          <>
            <button className="btn-ghost" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              disabled={!draft?.name.trim()}
              onClick={async () => {
                if (!draft) return;
                await store.saveDriver({ ...draft, name: draft.name.trim() });
                setDraft(null);
              }}
            >
              Save changes
            </button>
          </>
        }
      >
        {draft && <DriverForm value={draft} onChange={setDraft} />}
      </Modal>

      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.label ?? ""}
        wide
      >
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.src} alt={preview.label} className="w-full rounded-lg" />
        )}
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this driver?"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button
              className="btn-danger"
              onClick={async () => {
                await store.deleteDriver(driver.id);
                router.push("/drivers");
              }}
            >
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm text-navy-600">
          <strong>{driver.name}</strong> will be removed. Their {allTrips.length} existing{" "}
          {allTrips.length === 1 ? "entry stays" : "entries stay"} in place but will no longer show a
          driver name.
        </p>
      </Modal>
    </>
  );
}

function Row({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-navy-500">{label}</dt>
      <dd className={mono ? "font-mono text-xs font-semibold text-navy-900" : "font-semibold text-navy-900"}>
        {value || "—"}
      </dd>
    </div>
  );
}
