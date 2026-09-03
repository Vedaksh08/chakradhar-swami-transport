"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, FileText, Landmark, FileWarning } from "lucide-react";
import { useStore } from "@/lib/store";
import { entryTotal, fmtDate, inr } from "@/lib/calc";
import { Card, Chip, EmptyState, PageHeader, Stat, Table } from "@/components/ui";

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { companies, parties, entries, invoices, ready } = useStore();

  const companyEntity = companies.find((c) => c.id === id);
  const memberParties = useMemo(
    () => parties.filter((p) => p.companyId === id).sort((a, b) => a.name.localeCompare(b.name)),
    [parties, id]
  );
  const memberIds = useMemo(() => new Set(memberParties.map((p) => p.id)), [memberParties]);

  const companyEntries = useMemo(
    () => entries.filter((e) => memberIds.has(e.partyId)),
    [entries, memberIds]
  );

  const perParty = useMemo(() => {
    const m = new Map<string, { trips: number; total: number; unbilled: number }>();
    for (const e of companyEntries) {
      const s = m.get(e.partyId) ?? { trips: 0, total: 0, unbilled: 0 };
      s.trips += 1;
      s.total += entryTotal(e);
      if (!e.invoiceId) s.unbilled += entryTotal(e);
      m.set(e.partyId, s);
    }
    return m;
  }, [companyEntries]);

  const totals = useMemo(() => {
    let trips = 0;
    let total = 0;
    let unbilled = 0;
    for (const s of perParty.values()) {
      trips += s.trips;
      total += s.total;
      unbilled += s.unbilled;
    }
    return { trips, total, unbilled };
  }, [perParty]);

  const companyInvoices = useMemo(
    () =>
      invoices
        .filter((i) => i.companyId === id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [invoices, id]
  );

  if (!ready) return null;

  if (!companyEntity) {
    return (
      <EmptyState
        icon={<FileWarning size={32} />}
        title="Company not found"
        message="It may have been deleted."
        action={
          <Link href="/companies" className="btn-primary">
            Back to companies
          </Link>
        }
      />
    );
  }

  return (
    <>
      <Link
        href="/companies"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-navy-500 hover:text-navy-800"
      >
        <ArrowLeft size={15} /> All companies
      </Link>

      <PageHeader
        title={companyEntity.name}
        subtitle={
          [companyEntity.code && `Code ${companyEntity.code}`, companyEntity.gstin && `GSTIN ${companyEntity.gstin}`, companyEntity.phone]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        actions={
          <Link href={`/invoices?company=${companyEntity.id}`} className="btn-primary">
            <FileText size={16} /> Create invoice
          </Link>
        }
      />

      <div className="stagger mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Parties" value={memberParties.length} icon={<Landmark size={16} />} />
        <Stat label="Trips" value={totals.trips} />
        <Stat label="Billed" value={`₹${inr(totals.total)}`} tone="gold" />
        <Stat label="Unbilled" value={`₹${inr(totals.unbilled)}`} tone="red" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-1">
          <dl className="grid gap-2 text-sm">
            <Row label="Code" value={companyEntity.code} mono />
            <Row label="GSTIN" value={companyEntity.gstin} mono />
            <Row label="PAN" value={companyEntity.pan} mono />
            <Row label="Contact" value={companyEntity.contactPerson} />
            <Row label="Phone" value={companyEntity.phone} />
            <Row label="Email" value={companyEntity.email} />
          </dl>
          {companyEntity.address && (
            <p className="mt-4 whitespace-pre-line border-t border-navy-100 pt-3 text-sm text-navy-600">
              {companyEntity.address}
            </p>
          )}
          {companyEntity.notes && (
            <p className="mt-2 text-sm italic text-navy-500">{companyEntity.notes}</p>
          )}
        </Card>

        <Card
          title="Parties under this company"
          subtitle="Entries are still recorded against each party."
          className="lg:col-span-2"
          bodyClassName="p-0"
        >
          {memberParties.length === 0 ? (
            <EmptyState
              title="No parties yet"
              message="Assign parties to this company from the Parties tab."
            />
          ) : (
            <Table
              head={
                <>
                  <th className="th">Party</th>
                  <th className="th text-right">Trips</th>
                  <th className="th text-right">Billed</th>
                  <th className="th text-right">Unbilled</th>
                </>
              }
            >
              {memberParties.map((p) => {
                const s = perParty.get(p.id) ?? { trips: 0, total: 0, unbilled: 0 };
                return (
                  <tr key={p.id} className="transition hover:bg-navy-50/60">
                    <td className="td font-semibold">
                      <Link href={`/parties/${p.id}`} className="hover:underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="td tabular text-right">{s.trips}</td>
                    <td className="td tabular text-right font-semibold">₹{inr(s.total)}</td>
                    <td className="td tabular text-right">
                      {s.unbilled ? (
                        <span className="font-bold text-gold-700">₹{inr(s.unbilled)}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>
      </div>

      <Card
        className="mt-5"
        title="Invoices"
        subtitle="Bills raised against this company, covering every member party."
        bodyClassName="p-0"
      >
        {companyInvoices.length === 0 ? (
          <EmptyState title="No invoices yet" />
        ) : (
          <Table
            head={
              <>
                <th className="th">Invoice No</th>
                <th className="th">Date</th>
                <th className="th">Period</th>
                <th className="th text-right">Entries</th>
                <th className="th text-right">Total</th>
                <th className="th"></th>
              </>
            }
          >
            {companyInvoices.map((i) => (
              <tr key={i.id} className="transition hover:bg-navy-50/60">
                <td className="td font-bold">
                  <Link href={`/invoices/${i.id}/print`} className="hover:underline">
                    {i.invoiceNo}
                  </Link>
                </td>
                <td className="td">{fmtDate(i.date)}</td>
                <td className="td text-xs text-navy-500">
                  {fmtDate(i.fromDate)} → {fmtDate(i.toDate)}
                </td>
                <td className="td tabular text-right">{i.entryIds.length}</td>
                <td className="td tabular text-right font-bold">₹{inr(i.total)}</td>
                <td className="td">
                  {i.gstPaidByParty ? (
                    <Chip tone="slate">By party</Chip>
                  ) : (
                    <Chip tone="gold">GST added</Chip>
                  )}
                </td>
              </tr>
            ))}
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
