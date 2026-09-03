"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Download, Plus, Trash2, Truck, Pencil, AlertTriangle } from "lucide-react";
import type { Vehicle, VehicleExpense } from "@/lib/types";
import { useStore } from "@/lib/store";
import {
  entryDriverExpenses,
  entryNet,
  entryTotal,
  entryVehicleExpenses,
  fmtDate,
  inr,
  num,
  today,
  uid,
} from "@/lib/calc";
import { groupBy, inRangeLoose, standingExpenses, totalsFor } from "@/lib/report";
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
import { downloadCsv } from "@/lib/csv";
import { VehicleModal, blankVehicle } from "@/components/VehicleForm";

const CATEGORIES = [
  "Maintenance",
  "Tyre",
  "Insurance",
  "Fitness",
  "Permit",
  "PUC",
  "EMI",
  "Fine",
  "Other",
];

export default function VehicleDetailPage() {
  const params = useParams<{ no: string }>();
  const number = decodeURIComponent(params.no ?? "").toUpperCase();

  const store = useStore();
  const { vehicles, entries, partyName, driverName, vehicleNumbers, ready } = store;

  const vehicle = vehicles.find((v) => v.number.toUpperCase() === number);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [editingIsNew, setEditingIsNew] = useState(false);

  const [addingExpense, setAddingExpense] = useState(false);
  const [expDate, setExpDate] = useState(today());
  const [expCategory, setExpCategory] = useState(CATEGORIES[0]);
  const [expAmount, setExpAmount] = useState("");
  const [expNote, setExpNote] = useState("");
  const [confirmRemoveExp, setConfirmRemoveExp] = useState<VehicleExpense | null>(null);

  const allTrips = useMemo(
    () =>
      entries
        .filter((e) => e.vehicleNo.toUpperCase() === number)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [entries, number]
  );

  const trips = useMemo(
    () => allTrips.filter((e) => inRangeLoose(e.date, from, to)),
    [allTrips, from, to]
  );

  const standingList = useMemo(
    () =>
      (vehicle?.expenses ?? [])
        .filter((x) => inRangeLoose(x.date, from, to))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [vehicle, from, to]
  );

  const standing = useMemo(() => standingExpenses(vehicle, from, to), [vehicle, from, to]);
  const totals = useMemo(() => totalsFor(trips, standing), [trips, standing]);

  const byParty = useMemo(
    () => groupBy(trips, (e) => e.partyId, (k) => partyName(k)),
    [trips, partyName]
  );

  const expiries = useMemo(() => {
    if (!vehicle) return [];
    const t = today();
    return (
      [
        ["Insurance", vehicle.insuranceExpiry],
        ["Fitness", vehicle.fitnessExpiry],
        ["Permit", vehicle.permitExpiry],
        ["PUC", vehicle.pucExpiry],
      ] as const
    )
      .filter(([, d]) => !!d)
      .map(([label, d]) => ({ label, date: d as string, expired: (d as string) < t }));
  }, [vehicle]);

  async function addExpense() {
    if (!num(expAmount)) return;
    const base = vehicle ?? blankVehicle(number);
    await store.saveVehicle({
      ...base,
      expenses: [
        ...(base.expenses ?? []),
        {
          id: uid(),
          date: expDate,
          category: expCategory,
          amount: num(expAmount),
          note: expNote.trim() || undefined,
        },
      ],
    });
    setExpAmount("");
    setExpNote("");
    setExpDate(today());
    setAddingExpense(false);
  }

  async function removeExpense(id: string) {
    if (!vehicle) return;
    await store.saveVehicle({
      ...vehicle,
      expenses: (vehicle.expenses ?? []).filter((x) => x.id !== id),
    });
    setConfirmRemoveExp(null);
  }

  if (!ready) return null;

  if (!allTrips.length && !vehicle) {
    return (
      <EmptyState
        icon={<Truck size={32} />}
        title={`No vehicle ${number}`}
        message="Nothing has run under this registration, and it isn't in the fleet."
        action={
          <Link href="/vehicles" className="btn-primary">
            Back to vehicles
          </Link>
        }
      />
    );
  }

  return (
    <>
      <Link
        href="/vehicles"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-navy-500 hover:text-navy-800"
      >
        <ArrowLeft size={15} /> All vehicles
      </Link>

      <PageHeader
        title={number}
        subtitle={
          [vehicle?.type, vehicle?.ownerName, vehicle?.capacityMt && `${vehicle.capacityMt} MT`]
            .filter(Boolean)
            .join(" · ") || (vehicle ? undefined : "Not in the fleet list yet")
        }
        actions={
          <>
            <button onClick={() => setAddingExpense(true)} className="btn-ghost">
              <Plus size={16} /> Add expense
            </button>
            <button
              onClick={() => {
                setEditing(vehicle ?? blankVehicle(number));
                setEditingIsNew(!vehicle);
              }}
              className="btn-primary"
            >
              <Pencil size={16} /> {vehicle ? "Edit" : "Add to fleet"}
            </button>
          </>
        }
      />

      {expiries.some((x) => x.expired) && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle size={16} className="shrink-0" />
          <span className="font-semibold">Expired:</span>
          {expiries
            .filter((x) => x.expired)
            .map((x) => (
              <span key={x.label} className="font-semibold">
                {x.label} ({fmtDate(x.date)})
              </span>
            ))}
        </div>
      )}

      <Card className="mb-5" bodyClassName="p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="From" hint={from ? undefined : "any date"}>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To" hint={to ? undefined : "any date"}>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <button
              className="btn-ghost w-full"
              disabled={!trips.length}
              onClick={() =>
                downloadCsv(
                  [
                    ["Date", "Inv No", "Party", "Driver", "Qty", "Billed", "Trip cost", "Net"],
                    ...trips.map((e) => [
                      fmtDate(e.date),
                      e.invoiceNo,
                      partyName(e.partyId),
                      driverName(e.driverId),
                      e.qty,
                      entryTotal(e),
                      entryVehicleExpenses(e),
                      entryNet(e),
                    ]),
                  ],
                  `${number}-trips.csv`
                )
              }
            >
              <Download size={16} /> Export trips
            </button>
          </div>
        </div>
      </Card>

      <div className="stagger mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <Stat label="Trips" value={totals.trips} sub={`${allTrips.length} lifetime`} />
        <Stat label="Billed" value={`₹${inr(totals.billed)}`} tone="gold" />
        <Stat label="Trip costs" value={`₹${inr(totals.vehicleExp)}`} tone="red" />
        <Stat label="Other costs" value={`₹${inr(totals.standingExp)}`} tone="red" />
        <Stat
          label="Net"
          value={`₹${inr(totals.net)}`}
          tone={totals.net >= 0 ? "green" : "red"}
          sub={`${totals.qty.toFixed(3)} qty carried`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Vehicle expenses"
          subtitle="Costs not tied to a single trip — servicing, tyres, insurance."
          bodyClassName="p-0"
          actions={
            <button onClick={() => setAddingExpense(true)} className="btn-ghost btn-sm">
              <Plus size={14} /> Add
            </button>
          }
        >
          {standingList.length === 0 ? (
            <EmptyState
              title="Nothing recorded"
              message="Add servicing, tyres, insurance and anything else this vehicle cost."
            />
          ) : (
            <Table
              head={
                <>
                  <th className="th">Date</th>
                  <th className="th">Category</th>
                  <th className="th">Note</th>
                  <th className="th text-right">Amount</th>
                  <th className="th"></th>
                </>
              }
            >
              {standingList.map((x) => (
                <tr key={x.id} className="group transition hover:bg-navy-50/60">
                  <td className="td">{fmtDate(x.date)}</td>
                  <td className="td">
                    <Chip tone="navy">{x.category}</Chip>
                  </td>
                  <td className="td max-w-[240px] truncate text-navy-600">{x.note || "—"}</td>
                  <td className="td tabular text-right font-bold text-red-600">
                    ₹{inr(x.amount)}
                  </td>
                  <td className="td text-right">
                    <button
                      onClick={() => setConfirmRemoveExp(x)}
                      className="rounded-lg p-1.5 text-navy-400 opacity-100 transition hover:bg-red-50 hover:text-red-600 lg:opacity-0 lg:group-hover:opacity-100"
                      aria-label="Remove expense"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="bg-navy-50 font-bold">
                <td className="td" colSpan={3}>
                  {standingList.length} entries
                </td>
                <td className="td tabular text-right text-red-600">₹{inr(standing)}</td>
                <td className="td"></td>
              </tr>
            </Table>
          )}
        </Card>

        <Card title="Work by party" subtitle="Who this vehicle ran for." bodyClassName="p-0">
          {byParty.length === 0 ? (
            <EmptyState title="No trips in this range" />
          ) : (
            <Table
              head={
                <>
                  <th className="th">Party</th>
                  <th className="th text-right">Trips</th>
                  <th className="th text-right">Billed</th>
                </>
              }
            >
              {byParty.map((r) => (
                <tr key={r.key} className="transition hover:bg-navy-50/60">
                  <td className="td max-w-[160px] truncate">
                    <Link href={`/parties/${r.key}`} className="hover:underline">
                      {r.label}
                    </Link>
                  </td>
                  <td className="td tabular text-right">{r.totals.trips}</td>
                  <td className="td tabular text-right font-semibold">₹{inr(r.totals.billed)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <Card
        className="mt-5"
        title="Trip history"
        subtitle="Every entry run under this registration, with what each trip cost."
        bodyClassName="p-0"
      >
        {trips.length === 0 ? (
          <EmptyState title="No trips in this range" message="Widen the dates to see more." />
        ) : (
          <Table
            head={
              <>
                <th className="th">Date</th>
                <th className="th">Inv. No</th>
                <th className="th">Party</th>
                <th className="th">Driver</th>
                <th className="th text-right">Qty</th>
                <th className="th text-right">Billed</th>
                <th className="th text-right">Veh. exp</th>
                <th className="th text-right">Drv. exp</th>
                <th className="th text-right">Net</th>
              </>
            }
          >
            {trips.map((e) => {
              const net = entryNet(e);
              return (
                <tr key={e.id} className="transition hover:bg-navy-50/60">
                  <td className="td">{fmtDate(e.date)}</td>
                  <td className="td font-semibold">{e.invoiceNo}</td>
                  <td className="td max-w-[180px] truncate">{partyName(e.partyId)}</td>
                  <td className="td">{driverName(e.driverId)}</td>
                  <td className="td tabular text-right">{e.qty ? e.qty.toFixed(3) : "—"}</td>
                  <td className="td tabular text-right font-semibold">{inr(entryTotal(e))}</td>
                  <td className="td tabular text-right text-red-600">
                    {inr(entryVehicleExpenses(e))}
                  </td>
                  <td className="td tabular text-right text-red-600">
                    {inr(entryDriverExpenses(e))}
                  </td>
                  <td
                    className={cx(
                      "td tabular text-right font-bold",
                      net >= 0 ? "text-emerald-700" : "text-red-600"
                    )}
                  >
                    {inr(net)}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-navy-50 font-bold">
              <td className="td" colSpan={5}>
                {trips.length} trips
              </td>
              <td className="td tabular text-right">₹{inr(totals.billed)}</td>
              <td className="td tabular text-right text-red-600">₹{inr(totals.vehicleExp)}</td>
              <td className="td tabular text-right text-red-600">₹{inr(totals.driverExp)}</td>
              <td className="td tabular text-right">₹{inr(totals.net + totals.standingExp)}</td>
            </tr>
          </Table>
        )}
      </Card>

      {/* Add a standing expense */}
      <Modal
        open={addingExpense}
        onClose={() => setAddingExpense(false)}
        title="Add vehicle expense"
        subtitle={`Not tied to a trip · ${number}`}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setAddingExpense(false)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={!num(expAmount)} onClick={addExpense}>
              Save expense
            </button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" required>
            <Input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} />
          </Field>
          <Field label="Category" required>
            <Select value={expCategory} onChange={(e) => setExpCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount" required>
            <Input
              type="number"
              step="0.01"
              value={expAmount}
              onChange={(e) => setExpAmount(e.target.value)}
              placeholder="0.00"
              autoFocus
            />
          </Field>
          <Field label="Note">
            <Input
              value={expNote}
              onChange={(e) => setExpNote(e.target.value)}
              placeholder="What it was for"
            />
          </Field>
        </div>
        {!vehicle && (
          <p className="mt-4 rounded-lg bg-gold-50 px-3 py-2 text-xs text-gold-900">
            {number} isn&apos;t in the fleet yet — saving this will add it.
          </p>
        )}
      </Modal>

      <Modal
        open={!!confirmRemoveExp}
        onClose={() => setConfirmRemoveExp(null)}
        title="Remove this expense?"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setConfirmRemoveExp(null)}>
              Cancel
            </button>
            <button
              className="btn-danger"
              onClick={() => confirmRemoveExp && removeExpense(confirmRemoveExp.id)}
            >
              Remove
            </button>
          </>
        }
      >
        <p className="text-sm text-navy-600">
          {confirmRemoveExp?.category} of{" "}
          <strong>₹{inr(confirmRemoveExp?.amount ?? 0)}</strong> on{" "}
          <strong>{fmtDate(confirmRemoveExp?.date)}</strong> will be deleted.
        </p>
      </Modal>

      <VehicleModal
        draft={editing}
        isNew={editingIsNew}
        knownNumbers={vehicleNumbers}
        onClose={() => setEditing(null)}
        onSave={async (v) => {
          await store.saveVehicle(v);
          setEditing(null);
        }}
      />
    </>
  );
}
