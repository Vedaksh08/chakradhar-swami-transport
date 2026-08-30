import type { Entry } from "./types";

export function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export function round2(n: unknown): number {
  return Math.round((num(n) + Number.EPSILON) * 100) / 100;
}

/** What the entry auto-fills as its amount. Always editable afterwards. */
export function autoAmount(qty: unknown, rate: unknown): number {
  return round2(num(qty) * num(rate));
}

/** What the party is billed for this trip: amount + detention. */
export function entryTotal(e: Pick<Entry, "amount" | "detention">): number {
  return round2(num(e.amount) + num(e.detention));
}

/** Everything the driver spent on this trip. Never billed to the party. */
export function entryExpenses(e: Pick<Entry, "expenses">): number {
  return round2((e.expenses ?? []).reduce((s, x) => s + num(x.amount), 0));
}

export function entryProfit(e: Entry): number {
  return round2(entryTotal(e) - entryExpenses(e));
}

/* ------------------------------------------------------- driver settlement */

export interface Settlement {
  /** Agreed salary for the month. */
  salary: number;
  /** Trip costs the driver paid out of pocket — the company owes these back. */
  reimbursable: number;
  /** Cash already handed over. */
  advances: number;
  /**
   * salary + reimbursable - advances.
   * Positive: you owe the driver. Negative: the driver owes you.
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
 * What is owed between the company and a driver for one month.
 *
 * The driver is paid his salary and reimbursed for what he spent running the
 * trips; anything already advanced to him is deducted.
 */
export function settleMonth(
  driver: { monthlyPay?: number; advances?: { date: string; amount: number }[] },
  driverEntries: Entry[],
  month: string
): Settlement {
  const trips = driverEntries.filter((e) => monthOf(e.date) === month);
  const reimbursable = round2(trips.reduce((s, e) => s + entryExpenses(e), 0));

  const taken = (driver.advances ?? []).filter((a) => monthOf(a.date) === month);
  const advances = round2(taken.reduce((s, a) => s + num(a.amount), 0));

  const salary = round2(driver.monthlyPay);

  return {
    salary,
    reimbursable,
    advances,
    net: round2(salary + reimbursable - advances),
    tripCount: trips.length,
    advanceCount: taken.length,
  };
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
