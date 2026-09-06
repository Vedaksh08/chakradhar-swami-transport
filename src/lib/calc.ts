import type { Entry } from "./types";

export function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export function round2(n: unknown): number {
  return Math.round((num(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Rounds to whole rupees the way the paperwork does: anything under half a
 * rupee drops off, half or more counts as one. 1234.49 -> 1234, 1234.50 ->
 * 1235. Written sign-aware so a negative rounds away from zero too, rather
 * than JavaScript's habit of rounding -2.5 up to -2.
 */
export function roundRupees(v: unknown): number {
  const n = num(v);
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

/**
 * What the entry auto-fills as its amount. Always editable afterwards.
 * Comes out at whole rupees — that is what goes on the bill.
 */
export function autoAmount(qty: unknown, rate: unknown): number {
  return roundRupees(num(qty) * num(rate));
}

/** What the party is billed for this trip: amount + detention. */
export function entryTotal(e: Pick<Entry, "amount" | "detention">): number {
  return round2(num(e.amount) + num(e.detention));
}

function sumLines(lines?: { amount: number }[]): number {
  return round2((lines ?? []).reduce((s, x) => s + num(x.amount), 0));
}

/** What the driver spent on this trip. */
export function entryDriverExpenses(e: Pick<Entry, "driverExpenses">): number {
  return sumLines(e.driverExpenses);
}

/** What the vehicle cost on this trip: diesel, toll, running repairs. */
export function entryVehicleExpenses(e: Pick<Entry, "vehicleExpenses">): number {
  return sumLines(e.vehicleExpenses);
}

/** Driver + vehicle. Never billed to the party. */
export function entryExpenses(e: Pick<Entry, "driverExpenses" | "vehicleExpenses">): number {
  return round2(entryDriverExpenses(e) + entryVehicleExpenses(e));
}

/** What this single trip actually made: billed less everything it cost. */
export function entryNet(e: Entry): number {
  return round2(entryTotal(e) - entryExpenses(e));
}

/* ------------------------------------------------------- driver settlement */

export interface Settlement {
  /** Agreed salary for the month. */
  salary: number;
  /** Cash already handed over. */
  advances: number;
  /**
   * salary - advances.
   * Positive: you owe the driver. Negative: the driver owes you.
   *
   * Trip costs are deliberately NOT part of this: the advance is what the
   * driver runs the trip on, so reimbursing on top would pay him twice.
   */
  net: number;
  tripCount: number;
  advanceCount: number;
}

/** "2026-08" for a yyyy-mm-dd date. */
export function monthOf(dateISO: string): string {
  return (dateISO || "").slice(0, 7);
}

/** The current month as "2026-08". */
export function currentMonth(): string {
  return today().slice(0, 7);
}

/** Readable month label: "2026-08" -> "August 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
}

/**
 * What is owed between the company and a driver for one month:
 * salary earned, less whatever has already been advanced.
 */
export function settleMonth(
  driver: { monthlyPay?: number; advances?: { date: string; amount: number }[] },
  driverEntries: Entry[],
  month: string
): Settlement {
  const trips = driverEntries.filter((e) => monthOf(e.date) === month);

  const taken = (driver.advances ?? []).filter((a) => monthOf(a.date) === month);
  const advances = round2(taken.reduce((s, a) => s + num(a.amount), 0));

  const salary = round2(driver.monthlyPay);

  return {
    salary,
    advances,
    net: round2(salary - advances),
    tripCount: trips.length,
    advanceCount: taken.length,
  };
}

/* ------------------------------------------------------- invoice numbering */

/**
 * Build the next invoice number in the house format:
 *
 *   CST / MTC / 01 / 26-27
 *   ^     ^     ^    ^
 *   |     |     |    financial year of the invoice date
 *   |     |     serial for whoever is billed, within that year
 *   |     the party's (or company's) short code
 *   company prefix
 *
 * The serial restarts each financial year, per party or company, so
 * numbering stays readable on a shelf of paper files. `billToId` is a
 * party id for a party-billed invoice, or a company id for one billed to a
 * company — `existing` rows are matched on whichever of the two they carry.
 */
export function buildInvoiceNo(
  prefix: string,
  billToCode: string | undefined,
  dateISO: string,
  existing: { invoiceNo: string; partyId?: string; companyId?: string; date: string }[],
  billToId: string
): string {
  const head = (prefix || "CST").trim().toUpperCase();
  const code = (billToCode || "").trim().toUpperCase();
  const fy = fyLabel(dateISO);

  // Count this party's (or company's) invoices already in the same financial year.
  const used = existing.filter(
    (i) => (i.companyId || i.partyId) === billToId && fyLabel(i.date) === fy
  );

  // Prefer continuing from the highest serial actually seen, so gaps from
  // deletions don't cause a collision.
  let maxSerial = 0;
  for (const i of used) {
    const m = String(i.invoiceNo).match(/\/(\d+)\/[^/]*$/);
    if (m) maxSerial = Math.max(maxSerial, parseInt(m[1], 10));
  }
  const serial = String(Math.max(maxSerial, used.length) + 1).padStart(2, "0");

  return [head, code, serial, fy].filter(Boolean).join("/");
}

/** Indian financial year label for a date: 2026-08-30 -> "26-27" (Apr–Mar). */
export function fyLabel(dateISO: string): string {
  const d = new Date((dateISO || today()) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const start = d.getMonth() >= 3 ? y : y - 1; // April starts the FY
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

/** Indian digit grouping: 2,40,834.00 */
export function inr(n: unknown, withSymbol = false): string {
  const v = round2(n);
  const neg = v < 0;
  const [whole, dec] = Math.abs(v).toFixed(2).split(".");
  const out =
    whole.length <= 3
      ? whole
      : whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + whole.slice(-3);
  return `${neg ? "-" : ""}${withSymbol ? "₹" : ""}${out}.${dec}`;
}

/** Compact form for dashboard tiles: 2.41L, 12.5K */
export function inrShort(n: unknown): string {
  const v = num(n);
  const a = Math.abs(v);
  const s = v < 0 ? "-" : "";
  if (a >= 1e7) return `${s}${(a / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `${s}${(a / 1e5).toFixed(2)}L`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)}K`;
  return `${s}${a.toFixed(0)}`;
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  let s = "";
  if (h) s += ONES[h] + " Hundred";
  if (r) s += (s ? " " : "") + twoDigits(r);
  return s;
}

/** Indian numbering, matching the invoice wording ("Two Lac Fourty Thousand ... Only"). */
export function amountInWords(amount: unknown): string {
  const v = round2(Math.abs(num(amount)));
  const rupees = Math.floor(v);
  const paise = Math.round((v - rupees) * 100);
  if (!rupees && !paise) return "Zero Only";

  const parts: string[] = [];
  const crore = Math.floor(rupees / 1e7);
  const lakh = Math.floor((rupees % 1e7) / 1e5);
  const thousand = Math.floor((rupees % 1e5) / 1e3);
  const rest = rupees % 1e3;
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lac`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));

  let out = parts.join(" ").trim();
  if (paise) out += ` and ${twoDigits(paise)} Paise`;
  return `${out} Only`;
}

/** yyyy-mm-dd -> dd-mm-yyyy */
export function fmtDate(d?: string): string {
  if (!d) return "";
  const [y, m, dd] = d.split("-");
  return y && m && dd ? `${dd}-${m}-${y}` : d;
}

export function toISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function today(): string {
  return toISODate(new Date());
}

export function startOfMonth(ref = new Date()): string {
  return toISODate(new Date(ref.getFullYear(), ref.getMonth(), 1));
}

export function endOfMonth(ref = new Date()): string {
  return toISODate(new Date(ref.getFullYear(), ref.getMonth() + 1, 0));
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toISODate(d);
}

export function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
