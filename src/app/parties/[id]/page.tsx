"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Download, FileText, FileWarning, Truck } from "lucide-react";
import { useStore } from "@/lib/store";
import {
  entryDriverExpenses,
  entryNet,
  entryTotal,
  entryVehicleExpenses,
  fmtDate,
  inr,
} from "@/lib/calc";
import { groupBy, netByDirection, totalsFor } from "@/lib/report";
import {
  Card,
  Chip,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Stat,
  Table,
  cx,
} from "@/components/ui";
import { downloadCsv } from "@/lib/csv";

export default function PartyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { parties, companies, entries, invoices, partyName, driverName, ready } = useStore();

  const party = parties.find((p) => p.id === id);
  const parentCompany = companies.find((c) => c.id === party?.companyId);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const allTrips = useMemo(
    () => entries.filter((e) => e.partyId === id).sort((a, b) => b.date.localeCompare(a.date)),
    [entries, id]
  );

  const trips = useMemo(
    () => allTrips.filter((e) => (!from || e.date >= from) && (!to || e.date <= to)),
    [allTrips, from, to]
  );

  const totals = useMemo(() => totalsFor(trips), [trips]);
  const net = useMemo(() => netByDirection(trips), [trips]);

  const byVehicle = useMemo(
    () => groupBy(trips, (e) => e.vehicleNo, (k) => k),
    [trips]
  );

  const byConsignee = useMemo(
    () => groupBy(trips, (e) => e.consignee?.trim() || "—", (k) => k),
    [trips]
  );

  // Includes company invoices that happened to pull in this party's entries,
  // not just ones billed to the party directly.
  const partyInvoices = useMemo(() => {
    const tripIds = new Set(allTrips.map((e) => e.id));
    return invoices
      .filter((i) => i.partyId === id || (i.companyId && i.entryIds.some((eid) => tripIds.has(eid))))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [invoices, id, allTrips]);

  const unbilled = useMemo(
    () => trips.filter((e) => !e.invoiceId).reduce((s, e) => s + entryTotal(e), 0),
    [trips]
  );

  if (!ready) return null;

  if (!party) {
    return (
      <EmptyState
        icon={<FileWarning size={32} />}
        title="Party not found"
        message="It may have been deleted."
        action={
          <Link href="/parties" className="btn-primary">
            Back to parties
          </Link>
        }
      />
    );
  }

  return (
    <>
      <Link
        href="/parties"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-navy-500 hover:text-navy-800"
      >
        <ArrowLeft size={15} /> All parties
      </Link>

      <PageHeader
        title={party.name}
        subtitle={
          [party.gstin && `GSTIN ${party.gstin}`, party.phone].filter(Boolean).join(" · ") ||
          undefined
        }
        actions={
          <Link href={`/invoices?party=${party.id}`} className="btn-primary">
            <FileText size={16} /> Create invoice
          </Link>
        }
      />

      {/* Date window */}
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
                    ["Date", "Inv No", "Delivered to", "Vehicle", "Driver", "Qty", "Billed", "Net"],
                    ...trips.map((e) => [
                      fmtDate(e.date),
                      e.invoiceNo,
                      e.consignee ?? "",
                      e.vehicleNo,
                      driverName(e.driverId),
                      e.qty,
                      entryTotal(e),
                      entryNet(e),
                    ]),
                  ],
                  `${party.name.replace(/\s+/g, "-")}-trips.csv`
                )
              }
            >
              <Download size={16} /> Export trips
            </button>
          </div>
        </div>
      </Card>

      <div className="stagger mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6">
        <Stat
          label="Vehicles sent"
          value={totals.trips}
          sub={`${allTrips.length} lifetime`}
          icon={<Truck size={16} />}
        />
        <Stat label="Billed" value={`₹${inr(totals.billed)}`} tone="gold" />
        <Stat label="Detention" value={`₹${inr(totals.detention)}`} />
        <Stat label="Unbilled" value={`₹${inr(unbilled)}`} tone="red" />
        {/* Kept apart, the same as everywhere else the net is shown. */}
        <Stat
          label="Outward net"
          value={`₹${inr(net.outward)}`}
          tone={net.outward >= 0 ? "green" : "red"}
        />
        <Stat
          label="Inward net"
          value={`₹${inr(net.inward)}`}
          tone={net.inward >= 0 ? "green" : "red"}
          sub={`${totals.qty.toFixed(3)} qty`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-1">
          <dl className="grid gap-2 text-sm">
            {parentCompany && (
              <div className="flex justify-between gap-3">
                <dt className="text-navy-500">Company</dt>
                <dd className="font-semibold text-navy-900">
                  <Link href={`/companies/${parentCompany.id}`} className="hover:underline">
                    {parentCompany.name}
                  </Link>
                </dd>
              </div>
            )}
            <Row label="GSTIN" value={party.gstin} mono />
            <Row label="PAN" value={party.pan} mono />
            <Row label="Contact" value={party.contactPerson} />
            <Row label="Phone" value={party.phone} />
            <Row label="Email" value={party.email} />
          </dl>
          {party.address && (
            <p className="mt-4 whitespace-pre-line border-t border-navy-100 pt-3 text-sm text-navy-600">
              {party.address}
            </p>
          )}
          {party.notes && <p className="mt-2 text-sm italic text-navy-500">{party.notes}</p>}
        </Card>

        <Card
          title="Vehicles sent to this party"
          subtitle="Which vehicles ran, and what each brought in."
          className="lg:col-span-2"
          bodyClassName="p-0"
        >
          {byVehicle.length === 0 ? (
            <EmptyState title="No trips in this range" />
          ) : (
            <Table
              head={
                <>
                  <th className="th">Vehicle</th>
                  <th className="th text-right">Trips</th>
                  <th className="th text-right">Qty</th>
                  <th className="th text-right">Billed</th>
                  <th className="th text-right">Net</th>
                </>
              }
            >
              {byVehicle.map((r) => (
                <tr key={r.key} className="transition hover:bg-navy-50/60">
                  <td className="td font-mono text-xs font-bold">
                    <Link href={`/vehicles?no=${encodeURIComponent(r.key)}`} className="hover:underline">
                      {r.label}
                    </Link>
                  </td>
                  <td className="td tabular text-right">{r.totals.trips}</td>
                  <td className="td tabular text-right">{r.totals.qty.toFixed(3)}</td>
                  <td className="td tabular text-right font-semibold">₹{inr(r.totals.billed)}</td>
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
            </Table>
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card
          title="Delivered to"
          subtitle="Where this party's loads actually went."
          bodyClassName="p-0"
        >
          {byConsignee.length === 0 ? (
            <EmptyState title="Nothing recorded" />
          ) : (
            <Table
              head={
                <>
                  <th className="th">Name</th>
                  <th className="th text-right">Trips</th>
                  <th className="th text-right">Billed</th>
                </>
              }
            >
              {byConsignee.map((r) => (
                <tr key={r.key} className="transition hover:bg-navy-50/60">
                  <td className="td">{r.label}</td>
                  <td className="td tabular text-right">{r.totals.trips}</td>
                  <td className="td tabular text-right font-semibold">₹{inr(r.totals.billed)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Invoices" subtitle="Bills raised against this party." bodyClassName="p-0">
          {partyInvoices.length === 0 ? (
            <EmptyState title="No invoices yet" />
          ) : (
            <Table
              head={
                <>
                  <th className="th">Invoice No</th>
                  <th className="th">Date</th>
                  <th className="th text-right">Entries</th>
                  <th className="th text-right">Total</th>
                </>
              }
            >
              {partyInvoices.map((i) => (
                <tr key={i.id} className="transition hover:bg-navy-50/60">
                  <td className="td font-bold">
                    <Link href={`/invoices/${i.id}/print`} className="hover:underline">
                      {i.invoiceNo}
                    </Link>
                  </td>
                  <td className="td">{fmtDate(i.date)}</td>
                  <td className="td tabular text-right">{i.entryIds.length}</td>
                  <td className="td tabular text-right font-bold">₹{inr(i.total)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <Card
        className="mt-5"
        title="Trips"
        subtitle="Every entry billed to this party in the selected range."
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
                <th className="th">Delivered to</th>
                <th className="th">Vehicle</th>
                <th className="th">Driver</th>
                <th className="th text-right">Qty</th>
                <th className="th text-right">Billed</th>
                <th className="th text-right">Veh. exp</th>
                <th className="th text-right">Drv. exp</th>
                <th className="th text-right">Net</th>
                <th className="th">Status</th>
              </>
            }
          >
            {trips.map((e) => {
              const net = entryNet(e);
              return (
                <tr key={e.id} className="transition hover:bg-navy-50/60">
                  <td className="td">{fmtDate(e.date)}</td>
                  <td className="td font-semibold">{e.invoiceNo}</td>
                  <td className="td max-w-[180px] truncate">{e.consignee || partyName(e.partyId)}</td>
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
                  <td className="td">
                    {e.invoiceId ? <Chip tone="green">Billed</Chip> : <Chip tone="slate">Open</Chip>}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-navy-50 font-bold">
              <td className="td" colSpan={6}>
                {trips.length} trips
              </td>
              <td className="td tabular text-right">₹{inr(totals.billed)}</td>
              <td className="td tabular text-right text-red-600">₹{inr(totals.vehicleExp)}</td>
              <td className="td tabular text-right text-red-600">₹{inr(totals.driverExp)}</td>
              <td className="td tabular text-right">₹{inr(totals.net)}</td>
              <td className="td"></td>
            </tr>
          </Table>
        )}
      </Card>
    </>
  );
}

function Row({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-navy-500">{label}</dt>
      <dd
        className={
          mono ? "font-mono text-xs font-semibold text-navy-900" : "font-semibold text-navy-900"
        }
      >
        {value || "—"}
      </dd>
    </div>
  );
}
