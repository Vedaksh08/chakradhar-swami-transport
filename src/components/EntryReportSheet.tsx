"use client";

import { inr } from "@/lib/calc";

export interface ReportRow {
  id: string;
  date: string; // already formatted dd-mm-yyyy
  name: string;
  qty: number;
  amount: number;
  vehicleNo: string;
}

/**
 * The annexure attached behind the invoice — matches Entry Report.pdf:
 * bill no. heading, then DATE | NAME | QTY | AMT | VEH NO, then a total row.
 */
export function EntryReportSheet({
  invoiceNo,
  partyName,
  fromDate,
  toDate,
  rows,
  total,
}: {
  invoiceNo: string;
  partyName?: string;
  fromDate?: string;
  toDate?: string;
  rows: ReportRow[];
  total: number;
}) {
  return (
    <div className="print-page rpt-sheet">
      <style>{CSS}</style>

      <div className="rpt-head">
        <div className="rpt-billno">{invoiceNo}</div>
        {partyName && <div className="rpt-party">{partyName}</div>}
      </div>

      <table className="rpt-table">
        <thead>
          <tr>
            <th style={{ width: "16%" }}>DATE</th>
            <th style={{ width: "44%" }}>NAME</th>
            <th style={{ width: "12%" }}>QTY</th>
            <th style={{ width: "14%" }}>AMT</th>
            <th style={{ width: "18%" }}>VEH NO</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.date}</td>
              <td>{r.name}</td>
              <td className="num">{Number(r.qty || 0).toFixed(3)}</td>
              <td className="num">{inr(r.amount)}</td>
              <td>{r.vehicleNo}</td>
            </tr>
          ))}
          <tr className="rpt-total">
            <td />
            <td />
            <td />
            <td className="num">{inr(total)}</td>
            <td />
          </tr>
        </tbody>
      </table>

      {(fromDate || toDate) && (
        <p className="rpt-foot">
          Period {fromDate} to {toDate} · {rows.length} entries
        </p>
      )}
    </div>
  );
}

const CSS = `
.rpt-sheet {
  width: 794px;
  max-width: 100%;
  min-height: 1123px;
  margin: 0 auto;
  padding: 34px;
  background: #fff;
  box-shadow: 0 8px 30px rgba(16,40,70,.10);
  font-family: Arial, Helvetica, sans-serif;
  color: #18202a;
  box-sizing: border-box;
}
.rpt-sheet * { box-sizing: border-box; }
.rpt-head { margin-bottom: 8px; padding-left: 2px; }
.rpt-billno { font-size: 12px; font-weight: 700; }
.rpt-party { font-size: 10px; color: #687386; margin-top: 2px; }
.rpt-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.rpt-table th, .rpt-table td {
  border: 1px solid #000;
  padding: 3px 5px;
  font-size: 11px;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rpt-table th { text-align: center; font-weight: 700; }
.rpt-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
.rpt-total td { font-weight: 700; }
.rpt-foot { margin-top: 10px; font-size: 9px; color: #687386; }

@media print {
  .rpt-sheet { width: 100% !important; min-height: auto !important; box-shadow: none !important; padding: 0 !important; }
  .rpt-table { page-break-inside: auto; }
  .rpt-table tr { page-break-inside: avoid; }
  .rpt-table thead { display: table-header-group; }
}
`;
