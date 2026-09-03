"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Printer, FileWarning } from "lucide-react";
import { useStore } from "@/lib/store";
import { amountInWords, entryTotal, fmtDate, num } from "@/lib/calc";
import { EmptyState, cx } from "@/components/ui";
import { InvoiceSheet, type BillTo } from "@/components/InvoiceSheet";
import { EntryReportSheet } from "@/components/EntryReportSheet";

type Scope = "both" | "invoice" | "report";

const SCOPES: { key: Scope; label: string; title: string }[] = [
  { key: "both", label: "Both", title: "Invoice + entry report (2 pages)" },
  { key: "invoice", label: "Invoice", title: "The invoice page only" },
  { key: "report", label: "Entry report", title: "The entry report page only" },
];

export default function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const { invoices, parties, companies, entries, company, partyName, ready } = useStore();
  const [scope, setScope] = useState<Scope>("both");

  const invoice = invoices.find((i) => i.id === id);
  const party = parties.find((p) => p.id === invoice?.partyId);
  const billedCompany = companies.find((c) => c.id === invoice?.companyId);
  const billTo: BillTo | undefined = invoice?.companyId
    ? billedCompany
      ? { name: billedCompany.name, address: billedCompany.address, gstin: billedCompany.gstin }
      : { name: "—" }
    : party
      ? { name: party.name, address: party.address, gstin: party.gstin }
      : undefined;

  const rows = useMemo(() => {
    if (!invoice) return [];
    const byId = new Map(entries.map((e) => [e.id, e]));
    return invoice.entryIds
      .map((eid) => byId.get(eid))
      .filter((e): e is NonNullable<typeof e> => !!e)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [invoice, entries]);

  if (!ready) return null;

  if (!invoice) {
    return (
      <EmptyState
        icon={<FileWarning size={32} />}
        title="Invoice not found"
        message="It may have been deleted."
        action={
          <Link href="/invoices" className="btn-primary">
            Back to invoices
          </Link>
        }
      />
    );
  }

  const gstAmount = invoice.gstPaidByParty
    ? 0
    : (invoice.freightAmount * (num(invoice.sgstPercent) + num(invoice.cgstPercent))) / 100;

  // An "other bill" has no trip entries, so there's nothing to annex.
  const hasEntries = rows.length > 0;
  const scopes = hasEntries ? SCOPES : SCOPES.filter((s) => s.key === "invoice");
  const showInvoice = scope !== "report";
  const showReport = scope !== "invoice" && hasEntries;

  return (
    <div className="min-h-screen bg-navy-100 pb-10">
      {/* Toolbar — hidden when printing */}
      <div className="no-print sticky top-0 z-10 border-b border-navy-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[900px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link
            href="/invoices"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-600 hover:text-navy-900"
          >
            <ArrowLeft size={15} /> Invoices
          </Link>

          <div className="flex flex-1 flex-wrap items-center justify-end gap-2 sm:gap-3">
            {/* What to print */}
            <div
              className="flex w-full rounded-lg bg-navy-100 p-1 sm:w-auto"
              role="group"
              aria-label="What to print"
            >
              {scopes.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setScope(s.key)}
                  aria-pressed={scope === s.key}
                  title={s.title}
                  className={cx(
                    "flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-bold transition sm:flex-none",
                    scope === s.key
                      ? "bg-white text-navy-900 shadow-sm"
                      : "text-navy-500 hover:text-navy-800"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => window.print()}
              className="btn-primary w-full sm:w-auto"
            >
              <Printer size={16} /> Save as PDF
            </button>
          </div>
        </div>

        <p className="mx-auto max-w-[900px] px-4 pb-2.5 text-[11px] text-navy-500">
          {!hasEntries
            ? "1 page — no trip entries on this bill."
            : scope === "both"
              ? "2 pages — invoice, then the entry report."
              : scope === "invoice"
                ? "1 page — the invoice only."
                : "1 page — the entry report only."}
        </p>
      </div>

      {/* Sheets are fixed A4 width, so let narrow screens scroll rather than squash. */}
      <div className="mx-auto max-w-[900px] overflow-x-auto px-4 pt-6">
        {showInvoice && (
          <div className="animate-rise">
            <InvoiceSheet
              company={company}
              billTo={billTo}
              invoice={invoice}
              gstAmount={gstAmount}
              amountWords={amountInWords(invoice.total)}
            />
          </div>
        )}

        {showReport && (
          <div className={cx("animate-rise", showInvoice && "print-break mt-8")}>
            <EntryReportSheet
              invoiceNo={invoice.invoiceNo}
              partyName={billTo?.name}
              fromDate={fmtDate(invoice.fromDate)}
              toDate={fmtDate(invoice.toDate)}
              rows={rows.map((e) => ({
                id: e.id,
                date: fmtDate(e.date),
                // Company bills pool entries from several parties, so each
                // row falls back to its own party rather than the one name
                // on the invoice header.
                name: e.consignee?.trim() || partyName(e.partyId),
                qty: e.qty,
                amount: entryTotal(e),
                vehicleNo: e.vehicleNo,
              }))}
              total={invoice.freightAmount}
            />
          </div>
        )}
      </div>
    </div>
  );
}
