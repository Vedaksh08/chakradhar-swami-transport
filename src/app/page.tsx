"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Truck,
  IndianRupee,
  Receipt,
  TrendingUp,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Building2,
} from "lucide-react";
import { useStore } from "@/lib/store";
import {
  entryDriverExpenses,
  entryNet,
  entryTotal,
  entryVehicleExpenses,
  fmtDate,
  inr,
  startOfMonth,
  today,
  toISODate,
} from "@/lib/calc";
import { Card, Chip, Combo, EmptyState, PageHeader, Select, Stat, Table, cx } from "@/components/ui";

type RangeKey = "today" | "week" | "month" | "all";

export default function DashboardPage() {
  const { entries, invoices, parties, drivers, partyName, driverName } = useStore();
  const [range, setRange] = useState<RangeKey>("today");
  const [partyFilter, setPartyFilter] = useState("");

  const todayISO = today();

  const { from, to, label } = useMemo(() => {
    if (range === "today") return { from: todayISO, to: todayISO, label: "Today" };
    if (range === "week") {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      return { from: toISODate(d), to: todayISO, label: "Last 7 days" };
    }
    if (range === "month") return { from: startOfMonth(), to: todayISO, label: "This month" };
    return { from: "0000-01-01", to: "9999-12-31", label: "All time" };
  }, [range, todayISO]);

  const scoped = useMemo(
    () =>
      entries
        .filter((e) => e.date >= from && e.date <= to)
        .filter((e) => !partyFilter || e.partyId === partyFilter),
    [entries, from, to, partyFilter]
  );

  const totals = useMemo(
    () =>
      scoped.reduce(
        (a, e) => {
          a.billable += entryTotal(e);
          a.vehicleExp += entryVehicleExpenses(e);
          a.driverExp += entryDriverExpenses(e);
          a.net += entryNet(e);
          a.detention += e.detention ?? 0;
          if (e.direction === "outward") a.outward += 1;
          else a.inward += 1;
          return a;
        },
        { billable: 0, vehicleExp: 0, driverExp: 0, net: 0, detention: 0, outward: 0, inward: 0 }
      ),
    [scoped]
  );

  /** Vehicles sent per party in the selected window — the headline question. */
  const byParty = useMemo(() => {
    const m = new Map<string, { trips: number; qty: number; amount: number; net: number }>();
    for (const e of scoped) {
      const s = m.get(e.partyId) ?? { trips: 0, qty: 0, amount: 0, net: 0 };
      s.trips += 1;
      s.qty += e.qty || 0;
      s.amount += entryTotal(e);
      s.net += entryNet(e);
      m.set(e.partyId, s);
    }
    return [...m.entries()]
      .map(([id, s]) => ({ id, name: partyName(id), ...s }))
      .sort((a, b) => b.trips - a.trips || b.amount - a.amount);
  }, [scoped, partyName]);

  const maxTrips = byParty[0]?.trips ?? 0;

  const unbilled = useMemo(() => entries.filter((e) => !e.invoiceId), [entries]);
  const unbilledValue = useMemo(
    () => unbilled.reduce((s, e) => s + entryTotal(e), 0),
    [unbilled]
  );

  const recent = useMemo(
    () =>
      [...entries]
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
        .slice(0, 8),
    [entries]
  );

  const isEmpty = !entries.length && !parties.length;

  if (isEmpty) {
    return (
      <>
        <PageHeader title="Dashboard" subtitle="Let's get you set up." />
        <Card>
          <EmptyState
            icon={<Truck size={36} />}
            title="Welcome — nothing recorded yet"
            message="Start by adding the companies you bill, then record your first trip."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/parties" className="btn-primary">
                  <Building2 size={16} /> Add a party
                </Link>
                <Link href="/drivers" className="btn-ghost">
                  <Plus size={16} /> Add a driver
                </Link>
              </div>
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${label} · ${scoped.length} ${scoped.length === 1 ? "entry" : "entries"}`}
        actions={
          <>
            <div className="min-w-[190px]">
              <Combo
                options={[
                  { value: "", label: "All parties" },
                  ...parties.map((p) => ({ value: p.id, label: p.name })),
                ]}
                value={partyFilter}
                onChange={setPartyFilter}
                placeholder="All parties"
              />
            </div>
            <Select
              value={range}
              onChange={(e) => setRange(e.target.value as RangeKey)}
              className="w-auto"
              aria-label="Date range"
            >
              <option value="today">Today</option>
              <option value="week">Last 7 days</option>
              <option value="month">This month</option>
              <option value="all">All time</option>
            </Select>
            <Link href="/entries" className="btn-primary">
              <Plus size={16} /> New entry
            </Link>
          </>
        }
      />

      <div className="stagger mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <Stat
          label="Vehicles sent"
          value={scoped.length}
          sub={`${totals.outward} outward · ${totals.inward} inward`}
          icon={<Truck size={16} />}
        />
        <Stat
          label="Billable value"
          value={`₹${inr(totals.billable)}`}
          tone="gold"
          sub={totals.detention ? `incl. ₹${inr(totals.detention)} detention` : undefined}
          icon={<IndianRupee size={16} />}
        />
        <Stat
          label="Vehicle expenses"
          value={`₹${inr(totals.vehicleExp)}`}
          tone="red"
          icon={<Receipt size={16} />}
        />
        <Stat
          label="Driver expenses"
          value={`₹${inr(totals.driverExp)}`}
          tone="red"
          icon={<Receipt size={16} />}
        />
        <Stat
          label="Net"
          value={`₹${inr(totals.net)}`}
          tone={totals.net >= 0 ? "green" : "red"}
          icon={<TrendingUp size={16} />}
        />
      </div>

      {unbilled.length > 0 && (
        <Link
          href="/invoices"
          className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold-300 bg-gold-50 px-4 py-3 transition hover:border-gold-400"
        >
          <div className="text-sm text-gold-900">
            <strong className="font-bold">{unbilled.length} entries</strong> worth{" "}
            <strong className="font-bold">₹{inr(unbilledValue)}</strong> are not on an invoice yet.
          </div>
          <span className="text-sm font-bold text-gold-800 underline">Create invoice →</span>
        </Link>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Party breakdown */}
        <Card
          className="lg:col-span-3"
          title={`Vehicles by party — ${label.toLowerCase()}`}
          subtitle="How many vehicles went to each company, and what it's worth."
          bodyClassName={byParty.length ? "p-4" : "p-0"}
        >
          {byParty.length === 0 ? (
            <EmptyState
              title="No entries in this period"
              message="Switch the range above, or record a trip."
              action={
                <Link href="/entries" className="btn-primary">
                  <Plus size={16} /> New entry
                </Link>
              }
            />
          ) : (
            <div className="grid gap-3.5">
              {byParty.map((p) => (
                <div key={p.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-bold text-navy-900">{p.name}</span>
                    <span className="shrink-0 text-sm">
                      <span className="tabular font-bold text-navy-900">₹{inr(p.amount)}</span>
                      <span className="ml-2 text-xs text-navy-500">
                        {p.trips} {p.trips === 1 ? "vehicle" : "vehicles"}
                      </span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-navy-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-navy-700 to-navy-500"
                      style={{ width: `${maxTrips ? (p.trips / maxTrips) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Quick numbers */}
        <div className="grid content-start gap-5 lg:col-span-2">
          <Card title="At a glance">
            <dl className="grid gap-3 text-sm">
              <GlanceRow label="Parties" value={parties.length} href="/parties" />
              <GlanceRow
                label="Drivers"
                value={`${drivers.filter((d) => d.active).length} active`}
                href="/drivers"
              />
              <GlanceRow label="Invoices raised" value={invoices.length} href="/invoices" />
              <GlanceRow
                label="Total billed"
                value={`₹${inr(invoices.reduce((s, i) => s + i.total, 0))}`}
              />
              <GlanceRow label="Unbilled" value={`₹${inr(unbilledValue)}`} />
            </dl>
          </Card>

          <Card title="Detention charged" subtitle={label}>
            <p className="tabular text-3xl font-extrabold text-gold-600">
              ₹{inr(totals.detention)}
            </p>
            <p className="mt-1 text-xs text-navy-500">
              Across {scoped.filter((e) => e.detention).length} of {scoped.length} entries
            </p>
          </Card>
        </div>
      </div>

      <Card
        className="mt-5"
        title="Recent entries"
        subtitle="The last 8 trips recorded."
        bodyClassName="p-0"
        actions={
          <Link href="/entries" className="btn-ghost btn-sm">
            View all
          </Link>
        }
      >
        {recent.length === 0 ? (
          <EmptyState title="No entries yet" />
        ) : (
          <Table
            head={
              <>
                <th className="th">Date</th>
                <th className="th">Inv. No</th>
                <th className="th">Party</th>
                <th className="th">Vehicle</th>
                <th className="th">Driver</th>
                <th className="th text-right">Total</th>
                <th className="th">Status</th>
              </>
            }
          >
            {recent.map((e) => (
              <tr key={e.id} className="transition hover:bg-navy-50/60">
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
                <td className="td tabular text-right font-bold">₹{inr(entryTotal(e))}</td>
                <td className="td">
                  {e.invoiceId ? <Chip tone="green">Billed</Chip> : <Chip tone="slate">Open</Chip>}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

function GlanceRow({
  label,
  value,
  href,
}: {
  label: string;
  value: React.ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <dt className="text-navy-500">{label}</dt>
      <dd className={cx("font-bold text-navy-900", href && "group-hover:underline")}>{value}</dd>
    </>
  );
  return href ? (
    <Link href={href} className="group flex items-center justify-between">
      {body}
    </Link>
  ) : (
    <div className="flex items-center justify-between">{body}</div>
  );
}
