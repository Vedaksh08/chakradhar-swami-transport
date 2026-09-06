"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, Download, Printer } from "lucide-react";
import { useStore } from "@/lib/store";
import {
  endOfMonth,
  entryDriverExpenses,
  entryNet,
  entryTotal,
  entryVehicleExpenses,
  fmtDate,
  inr,
  startOfMonth,
  today,
} from "@/lib/calc";
import { groupBy, inRangeLoose, standingExpenses, totalsFor, type GroupRow } from "@/lib/report";
import { Card, Combo, EmptyState, Field, Input, PageHeader, Table, cx } from "@/components/ui";
import { downloadCsv } from "@/lib/csv";

type Kind = "party" | "vehicle" | "driver" | "detail";

const KINDS: { key: Kind; label: string }[] = [
  { key: "party", label: "Party" },
  { key: "vehicle", label: "Vehicle" },
  { key: "driver", label: "Driver" },
  { key: "detail", label: "Every trip" },
];

export default function ReportsPage() {
  const { entries, parties, drivers, vehicles, vehicleNumbers, partyName, driverName, company } =
    useStore();

  const [kind, setKind] = useState<Kind>("party");
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(endOfMonth());
  const [partyId, setPartyId] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [driverId, setDriverId] = useState("");

  const scoped = useMemo(
    () =>
      entries
        .filter((e) => inRangeLoose(e.date, from, to))
        .filter((e) => !partyId || e.partyId === partyId)
        .filter((e) => !vehicleNo || e.vehicleNo.toUpperCase() === vehicleNo)
        .filter((e) => !driverId || e.driverId === driverId)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [entries, from, to, partyId, vehicleNo, driverId]
  );

  /**
   * Standing vehicle costs in the window. Only counted when the report isn't
   * narrowed to a party or driver, where attributing them would be arbitrary.
   */
  const standing = useMemo(() => {
    if (partyId || driverId) return 0;
    return vehicles
      .filter((v) => !vehicleNo || v.number.toUpperCase() === vehicleNo)
      .reduce((s, v) => s + standingExpenses(v, from, to), 0);
  }, [vehicles, vehicleNo, partyId, driverId, from, to]);

  const tripTotals = useMemo(() => totalsFor(scoped), [scoped]);
  const totals = useMemo(() => totalsFor(scoped, standing), [scoped, standing]);

  const rows: GroupRow[] = useMemo(() => {
    if (kind === "party") return groupBy(scoped, (e) => e.partyId, (k) => partyName(k));
    if (kind === "vehicle") return groupBy(scoped, (e) => e.vehicleNo.toUpperCase(), (k) => k);
    if (kind === "driver") return groupBy(scoped, (e) => e.driverId ?? "", (k) => driverName(k));
    return [];
  }, [kind, scoped, partyName, driverName]);

  const kindLabel = KINDS.find((k) => k.key === kind)!.label;
  const rangeLabel = `${from ? fmtDate(from) : "start"} to ${to ? fmtDate(to) : "today"}`;

  const filterLabel = [
    partyId && partyName(partyId),
    vehicleNo,
    driverId && driverName(driverId),
  ]
    .filter(Boolean)
    .join(" · ");

  function exportCsv() {
    const rowsOut =
      kind === "detail"
        ? [
            ["Date", "Inv No", "Party", "Delivered to", "Vehicle", "Driver", "Qty", "Billed", "Vehicle exp", "Driver exp", "Net"],
            ...scoped.map((e) => [
              fmtDate(e.date),
              e.invoiceNo,
              partyName(e.partyId),
              e.consignee ?? "",
              e.vehicleNo,
              driverName(e.driverId),
              e.qty,
              entryTotal(e),
              entryVehicleExpenses(e),
              entryDriverExpenses(e),
              entryNet(e),
            ]),
          ]
        : [
            [kindLabel, "Trips", "Qty", "Billed", "Detention", "Vehicle exp", "Driver exp", "Net"],
            ...rows.map((r) => [
              r.label,
              r.totals.trips,
              r.totals.qty,
              r.totals.billed,
              r.totals.detention,
              r.totals.vehicleExp,
              r.totals.driverExp,
              r.totals.net,
            ]),
          ];
    downloadCsv(rowsOut, `report-${kind}-${from || "all"}-${to || "all"}.csv`);
  }

  return (
    <div className="print-landscape">
      <div className="no-print">
        <PageHeader
          title="Reports"
          subtitle="Roll the ledger up by party, vehicle or driver — or read it line by line."
          actions={
            <>
              <button onClick={exportCsv} className="btn-ghost" disabled={!scoped.length}>
                <Download size={16} /> Export
              </button>
              <button
                onClick={() => window.print()}
                className="btn-primary"
                disabled={!scoped.length}
              >
                <Printer size={16} /> Print
              </button>
            </>
          }
        />

        {/* One compact control row: what to group by, then the filters. */}
        <Card className="mb-5" bodyClassName="p-4">
          <div className="mb-4 inline-flex rounded-lg bg-navy-100 p-1">
            {KINDS.map((k) => (
              <button
                key={k.key}
                onClick={() => setKind(k.key)}
                aria-pressed={kind === k.key}
                className={cx(
                  "rounded-md px-3.5 py-1.5 text-xs font-bold transition",
                  kind === k.key
                    ? "bg-white text-navy-900 shadow-sm"
                    : "text-navy-500 hover:text-navy-800"
                )}
              >
                {k.label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
                  ...vehicleNumbers.map((v) => ({ value: v, label: v })),
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
          </div>
        </Card>
      </div>

      {/* Letterhead — paper only */}
      <div className="mb-5 hidden print:block">
        <div className="flex items-end justify-between border-b-2 border-navy-800 pb-2">
          <div>
            <h1 className="text-base font-extrabold uppercase tracking-wide">{company.name}</h1>
            <p className="text-[11px]">{company.address}</p>
          </div>
          <div className="text-right text-[11px]">
            <p className="font-bold uppercase tracking-wide">{kindLabel} report</p>
            <p>{rangeLabel}</p>
            {filterLabel && <p>{filterLabel}</p>}
          </div>
        </div>
      </div>

      <Card
        title={`${kindLabel} report`}
        subtitle={`${rangeLabel}${filterLabel ? ` · ${filterLabel}` : ""}`}
        bodyClassName="p-0"
      >
        {scoped.length === 0 ? (
          <EmptyState
            icon={<BarChart3 size={32} />}
            title="Nothing in this range"
            message="Widen the dates or clear a filter."
          />
        ) : kind === "detail" ? (
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
              </>
            }
          >
            {scoped.map((e) => {
              const net = entryNet(e);
              return (
                <tr key={e.id} className="transition hover:bg-navy-50/60">
                  <td className="td">{fmtDate(e.date)}</td>
                  <td className="td font-semibold">{e.invoiceNo}</td>
                  <td className="td max-w-[180px] truncate">{partyName(e.partyId)}</td>
                  <td className="td font-mono text-xs">{e.vehicleNo}</td>
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
                {tripTotals.trips} trips
              </td>
              <td className="td tabular text-right">{tripTotals.qty.toFixed(3)}</td>
              <td className="td tabular text-right">{inr(tripTotals.billed)}</td>
              <td className="td tabular text-right text-red-600">{inr(tripTotals.vehicleExp)}</td>
              <td className="td tabular text-right text-red-600">{inr(tripTotals.driverExp)}</td>
              <td className="td tabular text-right">{inr(tripTotals.net)}</td>
            </tr>
          </Table>
        ) : (
          <Table
            head={
              <>
                <th className="th">{kindLabel}</th>
                <th className="th text-right">Trips</th>
                <th className="th text-right">Qty</th>
                <th className="th text-right">Billed</th>
                <th className="th text-right">Detention</th>
                <th className="th text-right">Veh. exp</th>
                <th className="th text-right">Drv. exp</th>
                <th className="th text-right">Net</th>
              </>
            }
          >
            {rows.map((r) => (
              <tr key={r.key} className="transition hover:bg-navy-50/60">
                <td className="td font-semibold">
                  {kind === "party" ? (
                    <Link href={`/parties/${r.key}`} className="hover:underline">
                      {r.label}
                    </Link>
                  ) : kind === "vehicle" ? (
                    <Link
                      href={`/vehicles/${encodeURIComponent(r.key)}`}
                      className="font-mono text-xs hover:underline"
                    >
                      {r.label}
                    </Link>
                  ) : r.key ? (
                    <Link href={`/drivers/${r.key}`} className="hover:underline">
                      {r.label}
                    </Link>
                  ) : (
                    <span className="text-navy-400">No driver</span>
                  )}
                </td>
                <td className="td tabular text-right">{r.totals.trips}</td>
                <td className="td tabular text-right">{r.totals.qty.toFixed(3)}</td>
                <td className="td tabular text-right font-semibold">{inr(r.totals.billed)}</td>
                <td className="td tabular text-right text-gold-700">
                  {r.totals.detention ? inr(r.totals.detention) : "—"}
                </td>
                <td className="td tabular text-right text-red-600">
                  {r.totals.vehicleExp ? inr(r.totals.vehicleExp) : "—"}
                </td>
                <td className="td tabular text-right text-red-600">
                  {r.totals.driverExp ? inr(r.totals.driverExp) : "—"}
                </td>
                <td
                  className={cx(
                    "td tabular text-right font-bold",
                    r.totals.net >= 0 ? "text-emerald-700" : "text-red-600"
                  )}
                >
                  {inr(r.totals.net)}
                </td>
              </tr>
            ))}
            <tr className="bg-navy-50 font-bold">
              <td className="td">Total</td>
              <td className="td tabular text-right">{tripTotals.trips}</td>
              <td className="td tabular text-right">{tripTotals.qty.toFixed(3)}</td>
              <td className="td tabular text-right">{inr(tripTotals.billed)}</td>
              <td className="td tabular text-right text-gold-700">{inr(tripTotals.detention)}</td>
              <td className="td tabular text-right text-red-600">{inr(tripTotals.vehicleExp)}</td>
              <td className="td tabular text-right text-red-600">{inr(tripTotals.driverExp)}</td>
              <td className="td tabular text-right">{inr(tripTotals.net)}</td>
            </tr>
          </Table>
        )}
      </Card>

      {/*
        Standing vehicle costs can't be attributed to a party or driver, so they
        sit below the table rather than making the total disagree with its rows.
      */}
      {scoped.length > 0 && (
        <Card className="mt-5" bodyClassName="p-4">
          <dl className="ml-auto grid max-w-sm gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-navy-600">Net from trips</dt>
              <dd className="tabular font-semibold">₹{inr(tripTotals.net)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-navy-600">
                Vehicle costs not tied to a trip
                {(partyId || driverId) && (
                  <span className="ml-1 text-xs text-navy-400">(excluded by filter)</span>
                )}
              </dt>
              <dd className="tabular font-semibold text-red-600">− ₹{inr(standing)}</dd>
            </div>
            <div className="mt-1 flex justify-between border-t-2 border-navy-800 pt-2">
              <dt className="font-bold text-navy-900">Overall net</dt>
              <dd
                className={cx(
                  "tabular text-lg font-extrabold",
                  totals.net >= 0 ? "text-emerald-700" : "text-red-600"
                )}
              >
                ₹{inr(totals.net)}
              </dd>
            </div>
          </dl>
        </Card>
      )}
    </div>
  );
}
