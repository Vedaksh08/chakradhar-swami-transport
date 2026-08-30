"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, Download, Printer } from "lucide-react";
import { useStore } from "@/lib/store";
import {
  daysAgo,
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
import {
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Stat,
  Table,
  cx,
} from "@/components/ui";
import { downloadCsv } from "@/lib/csv";

type Kind = "party" | "vehicle" | "driver" | "detail";

const KINDS: { key: Kind; label: string; blurb: string }[] = [
  { key: "party", label: "By party", blurb: "What each company was billed, and what it earned." },
  { key: "vehicle", label: "By vehicle", blurb: "What each vehicle ran, earned and cost." },
  { key: "driver", label: "By driver", blurb: "Trips and spend per driver." },
  { key: "detail", label: "Every trip", blurb: "The full line-by-line ledger." },
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
   * Standing vehicle costs inside the window. Only counted when the report
   * isn't narrowed to a party or driver, where attributing them would be
   * arbitrary.
   */
  const standing = useMemo(() => {
    if (partyId || driverId) return 0;
    return vehicles
      .filter((v) => !vehicleNo || v.number.toUpperCase() === vehicleNo)
      .reduce((s, v) => s + standingExpenses(v, from, to), 0);
  }, [vehicles, vehicleNo, partyId, driverId, from, to]);

  const totals = useMemo(() => totalsFor(scoped, standing), [scoped, standing]);

  const rows: GroupRow[] = useMemo(() => {
    if (kind === "party") return groupBy(scoped, (e) => e.partyId, (k) => partyName(k));
    if (kind === "vehicle") return groupBy(scoped, (e) => e.vehicleNo.toUpperCase(), (k) => k);
    if (kind === "driver")
      return groupBy(scoped, (e) => e.driverId ?? "", (k) => driverName(k));
    return [];
  }, [kind, scoped, partyName, driverName]);

  const active = KINDS.find((k) => k.key === kind)!;

  const rangeLabel = `${from ? fmtDate(from) : "start"} to ${to ? fmtDate(to) : "today"}`;

  function exportCsv() {
    if (kind === "detail") {
      downloadCsv(
        [
          [
            "Date",
            "Inv No",
            "Party",
            "Delivered to",
            "Vehicle",
            "Driver",
            "Qty",
            "Billed",
            "Vehicle exp",
            "Driver exp",
            "Net",
          ],
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
        ],
        `report-detail-${from || "all"}-${to || "all"}.csv`
      );
      return;
    }

    downloadCsv(
      [
        [active.label, "Trips", "Qty", "Billed", "Detention", "Vehicle exp", "Driver exp", "Net"],
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
      ],
      `report-${kind}-${from || "all"}-${to || "all"}.csv`
    );
  }

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Roll the ledger up by party, vehicle or driver — or read it line by line."
        actions={
          <>
            <button onClick={exportCsv} className="btn-ghost" disabled={!scoped.length}>
              <Download size={16} /> Export
            </button>
            <button onClick={() => window.print()} className="btn-primary" disabled={!scoped.length}>
              <Printer size={16} /> Print
            </button>
          </>
        }
      />

      {/* Report picker */}
      <div className="no-print mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {KINDS.map((k) => (
          <button
            key={k.key}
            onClick={() => setKind(k.key)}
            className={cx(
              "rounded-xl border p-4 text-left transition",
              kind === k.key
                ? "border-navy-800 bg-navy-800 text-white shadow-card"
                : "border-navy-200 bg-white text-navy-800 hover:border-navy-400"
            )}
          >
            <p className="text-sm font-bold">{k.label}</p>
            <p
              className={cx(
                "mt-0.5 text-xs",
                kind === k.key ? "text-navy-200" : "text-navy-500"
              )}
            >
              {k.blurb}
            </p>
          </button>
        ))}
      </div>

      <Card className="no-print mb-5" bodyClassName="p-4">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(
            [
              { label: "This month", from: startOfMonth(), to: endOfMonth() },
              { label: "Last 30 days", from: daysAgo(30), to: today() },
              { label: "This year", from: `${new Date().getFullYear()}-01-01`, to: today() },
              { label: "All time", from: "", to: "" },
            ] as const
          ).map((r) => (
            <button
              key={r.label}
              onClick={() => {
                setFrom(r.from);
                setTo(r.to);
              }}
              className={cx(
                "rounded-full px-3 py-1 text-xs font-bold transition",
                from === r.from && to === r.to
                  ? "bg-navy-800 text-white"
                  : "border border-navy-200 text-navy-600 hover:bg-navy-50"
              )}
            >
              {r.label}
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
              {vehicleNumbers.map((v) => (
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
        </div>
      </Card>

      {/* Print header — only visible on paper */}
      <div className="mb-4 hidden print:block">
        <h1 className="text-lg font-extrabold">{company.name}</h1>
        <p className="text-sm">
          {active.label} · {rangeLabel}
        </p>
      </div>

      <div className="stagger mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <Stat label="Trips" value={totals.trips} sub={`${totals.qty.toFixed(3)} qty`} />
        <Stat label="Billed" value={`₹${inr(totals.billed)}`} tone="gold" />
        <Stat label="Vehicle costs" value={`₹${inr(totals.vehicleExp + totals.standingExp)}`} tone="red" />
        <Stat label="Driver costs" value={`₹${inr(totals.driverExp)}`} tone="red" />
        <Stat
          label="Net"
          value={`₹${inr(totals.net)}`}
          tone={totals.net >= 0 ? "green" : "red"}
        />
      </div>

      <Card
        title={active.label}
        subtitle={`${rangeLabel}${standing ? ` · includes ₹${inr(standing)} of standing vehicle costs` : ""}`}
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
            <TotalsRow labelSpan={5} totals={totals} />
          </Table>
        ) : (
          <Table
            head={
              <>
                <th className="th">{active.label.replace("By ", "")}</th>
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
                <td className="td tabular text-right font-semibold">₹{inr(r.totals.billed)}</td>
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
                  ₹{inr(r.totals.net)}
                </td>
              </tr>
            ))}
            <TotalsRow labelSpan={3} totals={totals} showDetention />
          </Table>
        )}
      </Card>
    </>
  );
}

function TotalsRow({
  labelSpan,
  totals,
  showDetention,
}: {
  labelSpan: number;
  totals: ReturnType<typeof totalsFor>;
  showDetention?: boolean;
}) {
  return (
    <tr className="bg-navy-50 font-bold">
      <td className="td" colSpan={labelSpan}>
        Total · {totals.trips} trips
      </td>
      {!showDetention && <td className="td tabular text-right">{totals.qty.toFixed(3)}</td>}
      {showDetention && <td className="td tabular text-right">{totals.qty.toFixed(3)}</td>}
      <td className="td tabular text-right">₹{inr(totals.billed)}</td>
      {showDetention && (
        <td className="td tabular text-right text-gold-700">₹{inr(totals.detention)}</td>
      )}
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
    </tr>
  );
}
