import type { Driver, Entry, Party } from "./types";
import { num, round2, roundRupees, uid } from "./calc";
import { parseCsv } from "./csv";

/**
 * Reads back the file the Entries screen exports.
 *
 * The columns are exactly the ones `exportCsv` writes, in that order, matched
 * by name so a spreadsheet that reorders them still lands correctly:
 *
 *   Date, Invoice No, Direction, Party, Delivered to, Driver, Vehicle,
 *   Qty, Rate, Amount, Detention, Billed, Vehicle expenses, Driver expenses,
 *   Net, Invoiced
 *
 * Billed and Net are worked out from the other columns, so they're read past.
 * Parties and drivers travel as names rather than ids — anything not already
 * on file is created, which is reported before a single row is written.
 */

export interface ImportPlan {
  /** Entries that match nothing on file and will be added. */
  added: Entry[];
  /** Entries matching one already recorded, which this file would overwrite. */
  updated: { next: Entry; previous: Entry }[];
  /** Parties named in the file that don't exist yet. */
  newParties: Party[];
  /** Drivers named in the file that don't exist yet. */
  newDrivers: Driver[];
  /** Row number (as the spreadsheet counts them) plus what was wrong. */
  problems: { row: number; message: string }[];
  /** How many data rows the file held. */
  totalRows: number;
  /** True when the file carried expense totals, which import as one line each. */
  hasExpenseTotals: boolean;
  /** True when rows were marked invoiced — that link can't come back. */
  hadInvoiced: boolean;
}

const HEADERS = {
  date: "date",
  invoiceNo: "invoice no",
  direction: "direction",
  party: "party",
  consignee: "delivered to",
  driver: "driver",
  vehicle: "vehicle",
  qty: "qty",
  rate: "rate",
  amount: "amount",
  detention: "detention",
  vehicleExp: "vehicle expenses",
  driverExp: "driver expenses",
  invoiced: "invoiced",
} as const;

/** A dash is what an empty name looks like once it has been through export. */
function clean(v: string | undefined): string {
  const s = (v ?? "").trim();
  return s === "—" || s === "-" ? "" : s;
}

/**
 * Accepts what the app writes (dd-mm-yyyy) as well as what a spreadsheet
 * tends to hand back (yyyy-mm-dd, or slashes instead of dashes).
 */
export function parseDate(input: string): string | null {
  const s = clean(input).replace(/\//g, "-");
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return iso(+y, +mo, +d);
  }

  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return iso(+y, +mo, +d);
  }

  return null;
}

function iso(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(mo)}-${pad(d)}`;
}

function keyOf(e: { date: string; invoiceNo: string; vehicleNo: string }) {
  return [e.date, e.invoiceNo.trim().toLowerCase(), e.vehicleNo.trim().toUpperCase()].join("|");
}

export function buildImportPlan(
  text: string,
  existing: { entries: Entry[]; parties: Party[]; drivers: Driver[] }
): ImportPlan {
  const rows = parseCsv(text);
  const plan: ImportPlan = {
    added: [],
    updated: [],
    newParties: [],
    newDrivers: [],
    problems: [],
    totalRows: 0,
    hasExpenseTotals: false,
    hadInvoiced: false,
  };

  if (!rows.length) {
    plan.problems.push({ row: 0, message: "The file is empty." });
    return plan;
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const at = (name: string) => header.indexOf(name);
  const col = {
    date: at(HEADERS.date),
    invoiceNo: at(HEADERS.invoiceNo),
    direction: at(HEADERS.direction),
    party: at(HEADERS.party),
    consignee: at(HEADERS.consignee),
    driver: at(HEADERS.driver),
    vehicle: at(HEADERS.vehicle),
    qty: at(HEADERS.qty),
    rate: at(HEADERS.rate),
    amount: at(HEADERS.amount),
    detention: at(HEADERS.detention),
    vehicleExp: at(HEADERS.vehicleExp),
    driverExp: at(HEADERS.driverExp),
    invoiced: at(HEADERS.invoiced),
  };

  if (col.date < 0 || col.party < 0 || col.vehicle < 0) {
    plan.problems.push({
      row: 1,
      message:
        "This doesn't look like an entries export — the Date, Party and Vehicle columns are missing. Export from this screen first to see the format.",
    });
    return plan;
  }

  // Names are matched case-insensitively; anything new is collected so it can
  // be created once rather than per row.
  const partyByName = new Map(existing.parties.map((p) => [p.name.trim().toLowerCase(), p]));
  const driverByName = new Map(existing.drivers.map((d) => [d.name.trim().toLowerCase(), d]));
  const entryByKey = new Map(existing.entries.map((e) => [keyOf(e), e]));
  const seen = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const rowNo = i + 1;
    const get = (index: number) => (index < 0 ? "" : clean(cells[index]));

    plan.totalRows++;

    const date = parseDate(get(col.date));
    if (!date) {
      plan.problems.push({
        row: rowNo,
        message: `Couldn't read the date "${get(col.date)}". Use dd-mm-yyyy.`,
      });
      continue;
    }

    const partyName = get(col.party);
    if (!partyName) {
      plan.problems.push({ row: rowNo, message: "No party on this row." });
      continue;
    }

    const vehicleNo = get(col.vehicle).toUpperCase();
    if (!vehicleNo) {
      plan.problems.push({ row: rowNo, message: "No vehicle on this row." });
      continue;
    }

    let party = partyByName.get(partyName.toLowerCase());
    if (!party) {
      party = { id: uid(), name: partyName, createdAt: new Date().toISOString() };
      partyByName.set(partyName.toLowerCase(), party);
      plan.newParties.push(party);
    }

    const driverName = get(col.driver);
    let driver: Driver | undefined;
    if (driverName) {
      driver = driverByName.get(driverName.toLowerCase());
      if (!driver) {
        driver = {
          id: uid(),
          name: driverName,
          active: true,
          createdAt: new Date().toISOString(),
        };
        driverByName.set(driverName.toLowerCase(), driver);
        plan.newDrivers.push(driver);
      }
    }

    const qty = num(get(col.qty));
    const rate = num(get(col.rate));
    // A row that was hand-written may leave Amount blank; qty x rate then
    // stands in, the same way the entry form fills it.
    // Whole rupees, the same rounding the entry form applies.
    const amountCell = get(col.amount);
    const amount = roundRupees(amountCell === "" ? qty * rate : num(amountCell));
    const detention = num(get(col.detention));

    const vehicleExp = num(get(col.vehicleExp));
    const driverExp = num(get(col.driverExp));
    if (vehicleExp || driverExp) plan.hasExpenseTotals = true;
    if (/^y/i.test(get(col.invoiced))) plan.hadInvoiced = true;

    const directionCell = get(col.direction).toLowerCase();
    const direction = directionCell.startsWith("in") ? "inward" : "outward";

    const invoiceNo = get(col.invoiceNo);
    const draft: Entry = {
      id: uid(),
      direction,
      invoiceNo,
      date,
      partyId: party.id,
      consignee: get(col.consignee) || undefined,
      qty,
      rate,
      amount,
      detention: detention || undefined,
      vehicleNo,
      driverId: driver?.id,
      // The export flattens each expense list to one total, so that total
      // comes back as a single line rather than being silently dropped.
      driverExpenses: driverExp
        ? [{ id: uid(), label: "Imported", amount: round2(driverExp) }]
        : [],
      vehicleExpenses: vehicleExp
        ? [{ id: uid(), label: "Imported", amount: round2(vehicleExp) }]
        : [],
      photos: [],
      createdAt: new Date().toISOString(),
    };

    const key = keyOf(draft);
    if (seen.has(key)) {
      plan.problems.push({
        row: rowNo,
        message: "Same date, invoice no. and vehicle as an earlier row — skipped.",
      });
      continue;
    }
    seen.add(key);

    const match = entryByKey.get(key);
    if (match) {
      // Keep the entry's own identity and its place on any invoice.
      plan.updated.push({
        previous: match,
        next: {
          ...draft,
          id: match.id,
          createdAt: match.createdAt,
          invoiceId: match.invoiceId,
          photos: match.photos ?? [],
        },
      });
    } else {
      plan.added.push(draft);
    }
  }

  return plan;
}
