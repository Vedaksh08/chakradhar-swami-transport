"use client";

import type { CompanyProfile, Invoice } from "@/lib/types";
import { fmtDate, inr, num } from "@/lib/calc";

/** Whoever the invoice is made out to — a party, or a company billed on their behalf. */
export interface BillTo {
  name: string;
  address?: string;
  gstin?: string;
}

/**
 * A4 invoice, matching chakradhar_swami_transport_invoice_professional.html.
 * Styles are scoped inline so print output is identical regardless of app CSS.
 */
export function InvoiceSheet({
  company,
  billTo,
  invoice,
  gstAmount,
  amountWords,
}: {
  company: CompanyProfile;
  billTo?: BillTo;
  invoice: Invoice;
  gstAmount: number;
  amountWords: string;
}) {
  return (
    <div className="print-page inv-sheet">
      <style>{CSS}</style>

      {/* HEADER */}
      <header className="inv-header">
        <div className="logo-column">
          <div className="truck-logo">
            {company.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logo} alt="" />
            ) : (
              <span className="logo-fallback">CST</span>
            )}
          </div>
        </div>

        <div className="company-block">
          <div className="company-shree">{company.shree}</div>
          <div className="company-name">{company.name}</div>
          <div className="tagline">Reliable • Professional • Transport Services</div>
          <div className="company-address">{company.address}</div>
        </div>

        <div className="company-contact">
          <div>
            <strong>EMAIL</strong>
            <br />
            {company.email}
          </div>
          <div style={{ marginTop: 5 }}>
            <strong>MOBILE</strong>
            <br />
            {company.phone}
          </div>
        </div>
      </header>

      {/* TITLE */}
      <div className="invoice-title-row">
        <div className="invoice-title">Transport Invoice</div>
        <div className="invoice-number-box">
          <div className="label">Invoice / Bill No.</div>
          <div className="value">#{invoice.invoiceNo}</div>
        </div>
      </div>

      {/* BILL TO */}
      <section className="invoice-meta">
        <div className="bill-to">
          <div className="section-label">Bill To</div>
          <div className="customer-name">{billTo?.name ?? "—"}</div>
          <div className="customer-address">{billTo?.address}</div>
          {billTo?.gstin && (
            <div className="customer-gstin" style={{ marginTop: 5 }}>
              <strong>GSTIN:</strong> {billTo.gstin}
            </div>
          )}
        </div>

        <div className="invoice-details">
          <div className="label">Date</div>
          <div className="value">{fmtDate(invoice.date)}</div>

          <div className="label">Invoice No.</div>
          <div className="value">{invoice.invoiceNo}</div>

          <div className="label">Period</div>
          <div className="value">
            {fmtDate(invoice.fromDate)} – {fmtDate(invoice.toDate)}
          </div>

          <div className="label">PAN</div>
          <div className="value">{company.pan}</div>
        </div>
      </section>

      {/* PARTICULARS */}
      <div className="particulars-bar">
        <div className="title">Transport Particulars</div>
        <div className="line" />
      </div>

      <table className="transport-table">
        <thead>
          <tr>
            <th className="col-no">No.</th>
            <th className="col-vehicle">Veh. No.</th>
            <th className="col-from">From</th>
            <th className="col-to">To</th>
            <th className="col-rate">Rate</th>
            <th className="col-trip">Trip</th>
            <th className="col-amount">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr className="transport-description-row">
            <td />
            <td />
            <td colSpan={2}>
              <div className="transport-description">
                TRANSPORTATION CHARGES AS PER
                <br />
                DETAIL ATTACHED
                <small>
                  {invoice.entryIds.length} trips · {fmtDate(invoice.fromDate)} to{" "}
                  {fmtDate(invoice.toDate)}
                </small>
              </div>
            </td>
            <td className="summary-label">Freight Amt.</td>
            <td />
            <td className="summary-value">{inr(invoice.freightAmount)}</td>
          </tr>

          <tr className="gst-row">
            <td colSpan={4} />
            <td className="summary-label">
              {invoice.gstPaidByParty ? "GST Paid By Party" : "GST"}
            </td>
            <td className="summary-label">SGST%</td>
            <td className="summary-value">
              {invoice.gstPaidByParty ? "" : num(invoice.sgstPercent) || ""}
            </td>
          </tr>

          <tr className="gst-row">
            <td colSpan={4} />
            <td />
            <td className="summary-label">CGST%</td>
            <td className="summary-value">
              {invoice.gstPaidByParty ? "" : num(invoice.cgstPercent) || ""}
            </td>
          </tr>

          {!invoice.gstPaidByParty && gstAmount > 0 && (
            <tr className="gst-row">
              <td colSpan={4} />
              <td />
              <td className="summary-label">GST Amt.</td>
              <td className="summary-value">{inr(gstAmount)}</td>
            </tr>
          )}

          <tr className="total-row">
            <td colSpan={4} />
            <td colSpan={2} className="summary-label">
              Total
            </td>
            <td className="summary-value">{inr(invoice.total)}</td>
          </tr>
        </tbody>
      </table>

      <div className="amount-words">
        <strong>Total Amount In Words:</strong> {amountWords}
      </div>

      {invoice.notes && <div className="invoice-notes">{invoice.notes}</div>}

      <section className="signature-section">
        <div className="receiver-signature">
          <div className="signature-title">Receiver&apos;s Signature</div>
          <div className="signature-space" />
          <div className="signature-line">Receiver / Authorized Representative</div>
        </div>
        <div className="authorized-signature">
          <div className="for-company">For {company.name}</div>
          <div className="signature-space" />
          <div className="signature-line">Authorized Signatory</div>
        </div>
      </section>

      <div className="footer-strip">
        <span>
          <strong>{company.name}</strong>
        </span>
        <span>Thank you for your business.</span>
      </div>
    </div>
  );
}

const CSS = `
.inv-sheet {
  --primary: #17365d;
  --accent: #d59b2a;
  --accent-soft: #fff7e5;
  --ink: #18202a;
  --muted: #687386;
  --line: #d8dee7;
  --soft: #f5f7fa;
  width: 794px;
  max-width: 100%;
  min-height: 1123px;
  margin: 0 auto;
  padding: 28px;
  background: #fff;
  box-shadow: 0 8px 30px rgba(16,40,70,.10);
  position: relative;
  overflow: hidden;
  font-family: Arial, Helvetica, sans-serif;
  color: var(--ink);
  box-sizing: border-box;
}
.inv-sheet * { box-sizing: border-box; }
.inv-sheet::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 6px;
  background: linear-gradient(90deg, var(--primary) 0 72%, var(--accent) 72% 100%);
}
.inv-header {
  display: grid; grid-template-columns: 92px 1fr auto; align-items: center; gap: 18px;
  padding: 18px 0 16px; border-bottom: 1px solid var(--line);
}
.logo-column { width: 92px; text-align: center; }
.truck-logo {
  width: 78px; height: 78px; border: 2px solid var(--accent); border-radius: 50%;
  margin: 0 auto; overflow: hidden; background: #fff; padding: 4px;
  display: flex; align-items: center; justify-content: center;
}
.truck-logo img { width: 100%; height: 100%; object-fit: contain; border-radius: 50%; }
.logo-fallback { color: var(--primary); font-size: 20px; font-weight: 800; letter-spacing: .5px; }
.company-block .company-shree {
  color: var(--accent); font-family: "Nirmala UI","Noto Serif Devanagari",Georgia,serif;
  font-size: 27px; font-weight: 800; line-height: 1; text-align: center; margin-bottom: 5px;
}
.company-block .company-name { color: var(--primary); font-size: 24px; font-weight: 800; letter-spacing: .3px; line-height: 1.15; }
.company-block .tagline { margin-top: 5px; color: var(--accent); font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; }
.company-block .company-address { margin-top: 8px; max-width: 430px; color: var(--muted); font-size: 10px; line-height: 1.45; }
.company-contact { text-align: right; font-size: 10px; line-height: 1.65; color: var(--muted); white-space: nowrap; }
.company-contact strong { color: var(--primary); }
.invoice-title-row { display: flex; justify-content: space-between; align-items: end; padding: 17px 0 14px; }
.invoice-title { font-size: 25px; line-height: 1; font-weight: 800; color: var(--primary); text-transform: uppercase; letter-spacing: 1.2px; }
.invoice-title::after { content: ""; display: block; width: 44px; height: 3px; margin-top: 8px; background: var(--accent); }
.invoice-number-box { text-align: right; }
.invoice-number-box .label { color: var(--muted); font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
.invoice-number-box .value { margin-top: 3px; color: var(--primary); font-size: 15px; font-weight: 800; }
.invoice-meta { display: grid; grid-template-columns: 1.35fr .85fr; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; margin-bottom: 16px; }
.bill-to, .invoice-details { padding: 13px 15px; }
.bill-to { border-right: 1px solid var(--line); background: #fbfcfe; }
.section-label { color: var(--accent); font-size: 8.5px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase; margin-bottom: 7px; }
.customer-name { color: var(--primary); font-size: 13px; font-weight: 800; text-transform: uppercase; margin-bottom: 4px; }
.customer-address, .customer-gstin { color: var(--muted); font-size: 10px; line-height: 1.5; white-space: pre-line; }
.invoice-details { display: grid; grid-template-columns: 78px 1fr; row-gap: 8px; align-content: center; font-size: 10px; }
.invoice-details .label { color: var(--muted); font-weight: 700; }
.invoice-details .value { color: var(--ink); font-weight: 700; text-align: right; }
.particulars-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 7px; }
.particulars-bar .title { color: var(--primary); font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
.particulars-bar .line { height: 1px; background: var(--line); flex: 1; }
.transport-table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid var(--line); border-radius: 7px; overflow: hidden; table-layout: fixed; }
.transport-table th { background: var(--primary); color: #fff; padding: 8px 5px; border-right: 1px solid rgba(255,255,255,.18); font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .6px; text-align: center; }
.transport-table th:last-child { border-right: 0; }
.transport-table td { padding: 6px 5px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); font-size: 9.5px; vertical-align: top; word-wrap: break-word; }
.transport-table td:last-child { border-right: 0; }
.transport-table tbody tr:last-child td { border-bottom: 0; }
.col-no { width: 5%; } .col-vehicle { width: 12%; } .col-from { width: 14%; } .col-to { width: 14%; }
.col-rate { width: 12%; } .col-trip { width: 9%; } .col-amount { width: 15%; }
.transport-description-row td { height: 285px; vertical-align: top; padding-top: 15px; }
.transport-description { color: var(--primary); font-size: 10px; font-weight: 800; line-height: 1.5; text-align: center; text-transform: uppercase; }
.transport-description small { display: block; color: var(--muted); font-size: 8px; font-weight: 600; margin-top: 4px; text-transform: none; }
.summary-label { color: var(--muted); font-size: 8.5px !important; font-weight: 800; text-align: right; text-transform: uppercase; }
.summary-value { color: var(--primary); font-weight: 800; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.gst-row td { background: #fbfcfe; }
.total-row td { background: var(--accent-soft); border-bottom: 0 !important; border-top: 2px solid var(--accent); padding-top: 9px; padding-bottom: 9px; }
.total-row .summary-label { color: var(--primary) !important; font-size: 10px !important; }
.total-row .summary-value { font-size: 12px; }
.amount-words { margin-top: 12px; padding: 10px 12px; background: var(--soft); border-left: 4px solid var(--accent); border-radius: 4px; font-size: 9.5px; line-height: 1.5; }
.amount-words strong { color: var(--primary); }
.invoice-notes { margin-top: 8px; padding: 8px 12px; font-size: 9px; color: var(--muted); border: 1px dashed var(--line); border-radius: 4px; white-space: pre-line; }
.signature-section { display: grid; grid-template-columns: 1fr 1fr; margin-top: 22px; border-top: 1px solid var(--line); }
.receiver-signature, .authorized-signature { min-height: 100px; padding: 13px 12px; }
.receiver-signature { border-right: 1px solid var(--line); }
.signature-title { color: var(--muted); font-size: 9px; font-weight: 700; }
.authorized-signature { text-align: right; }
.authorized-signature .for-company { color: var(--primary); font-size: 10px; font-weight: 800; }
.signature-space { height: 52px; }
.signature-line { border-top: 1px solid var(--line); padding-top: 5px; color: var(--muted); font-size: 8px; }
.authorized-signature .signature-line { border: 0; color: var(--primary); font-weight: 700; }
.footer-strip { margin-top: 7px; padding-top: 9px; border-top: 1px solid var(--line); display: flex; justify-content: space-between; color: var(--muted); font-size: 8px; }
.footer-strip strong { color: var(--primary); }

/* Narrow screens: let the letterhead stack instead of being clipped by the
   sheet's overflow:hidden. Screen-only — print keeps the exact A4 layout. */
@media screen and (max-width: 860px) {
  .inv-sheet { padding: 18px; }
  .inv-header { grid-template-columns: 1fr; justify-items: center; text-align: center; gap: 10px; }
  .inv-header .company-block { text-align: center; }
  .company-block .company-address { max-width: none; }
  .company-contact { text-align: center; white-space: normal; }
  .invoice-meta { grid-template-columns: 1fr; }
  .bill-to { border-right: 0; border-bottom: 1px solid var(--line); }
  .transport-description-row td { height: 150px; }
}

@media print {
  .inv-sheet { width: 100% !important; min-height: auto !important; box-shadow: none !important; padding: 0 !important; }
}
`;
