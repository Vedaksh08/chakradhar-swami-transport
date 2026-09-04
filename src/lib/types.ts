// Domain model.

export type Direction = "outward" | "inward";

/** A free-form cost line: diesel, toll, tyre, anything. */
export interface ExpenseLine {
  id: string;
  label: string;
  amount: number;
}

/** A named attachment on an entry — POD, weighment slip, damage photo, etc. */
export interface PhotoLine {
  id: string;
  name: string;
  /** data URL */
  src: string;
}

/** Money handed to a driver up front, to be settled against what he's owed. */
export interface AdvanceLine {
  id: string;
  date: string; // yyyy-mm-dd
  amount: number;
  note?: string;
}

export interface Party {
  id: string;
  name: string;
  address?: string;
  gstin?: string;
  pan?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  notes?: string;
  /**
   * The company this party bills under, if any — e.g. branches "AB", "AC",
   * "AD" all belonging to company "MTC". When set, entries against this
   * party can be pulled into one invoice raised to the company instead of
   * the party directly.
   */
  companyId?: string;
  createdAt: string;
}

/**
 * A billing company — a group of parties (branches/divisions) that get
 * invoiced together as one bill, even though entries are still recorded
 * against the individual party. Distinct from `CompanyProfile`, which is
 * *your own* letterhead details.
 */
export interface Company {
  id: string;
  name: string;
  /** Short code used to build invoice numbers, e.g. "MTC" -> CST/MTC/01/26-27 */
  code?: string;
  address?: string;
  gstin?: string;
  pan?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  notes?: string;
  createdAt: string;
}

export interface Driver {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  licenceNo?: string;
  panNo?: string;
  aadhaarNo?: string;
  policeVerification?: string;
  active: boolean;
  notes?: string;

  /** Agreed salary per month. Drives the monthly settlement. */
  monthlyPay?: number;
  /** Advances taken, dated so a month can be settled on its own. */
  advances?: AdvanceLine[];

  /** Scanned copies, stored as data URLs. All optional. */
  docs?: {
    photo?: string;
    pan?: string;
    aadhaar?: string;
    licence?: string;
    police?: string;
  };
  createdAt: string;
}

/**
 * A vehicle in the fleet.
 *
 * Vehicles are also referenced by registration number on entries, so one can
 * appear in reports before anybody creates a record for it here.
 */
export interface Vehicle {
  id: string;
  number: string; // MH12NX9008 — stored uppercase, unique in practice
  make?: string;
  type?: string;
  ownerName?: string;
  capacityMt?: number;
  active: boolean;
  notes?: string;

  // Renewal dates, so expiries can be surfaced
  insuranceExpiry?: string;
  fitnessExpiry?: string;
  permitExpiry?: string;
  pucExpiry?: string;

  /** Costs not tied to any single trip: servicing, tyres, insurance premium. */
  expenses?: VehicleExpense[];
  createdAt: string;
}

/** A standalone vehicle cost, entered by hand on the vehicle page. */
export interface VehicleExpense {
  id: string;
  date: string; // yyyy-mm-dd
  category: string; // Maintenance / Tyre / Insurance / ...
  amount: number;
  note?: string;
}

/** One trip = one entry. */
export interface Entry {
  id: string;
  direction: Direction;
  invoiceNo: string; // the entry's own invoice / LR number
  date: string; // yyyy-mm-dd
  partyId: string;

  /**
   * Where the load actually went. This is the NAME column on the Entry Report
   * (e.g. "WHEELS INDIA LTD"). Falls back to the billing party when blank.
   */
  consignee?: string;

  qty: number;
  rate: number;
  /** qty x rate, auto-filled but editable — real trips are often a flat rate. */
  amount: number;

  /** Optional. Adds straight onto this entry's total. */
  detention?: number;
  detentionRemark?: string;

  vehicleNo: string;
  driverId?: string;

  /** What the driver spent: batta, food, driver advance on the road. */
  driverExpenses: ExpenseLine[];
  /** What the vehicle cost on this trip: diesel, toll, parking, repairs. */
  vehicleExpenses: ExpenseLine[];

  /** Named attachments: POD, weighment slip, anything. */
  photos: PhotoLine[];
  remarks?: string;

  /** Set once this entry has been pulled into a generated invoice. */
  invoiceId?: string;

  createdAt: string;
}

export interface Invoice {
  id: string;
  invoiceNo: string; // CST/MTC/01/26-27 — auto-built, always editable
  date: string;
  /**
   * Exactly one of `partyId` / `companyId` is set. A party-billed invoice
   * pulls entries from that one party; a company-billed invoice pulls
   * entries from every party under that company, but is still one bill
   * made out to the company.
   */
  partyId?: string;
  companyId?: string;
  fromDate: string;
  toDate: string;
  /**
   * "trip" (default when absent) pulls entries into the bill as usual.
   * "other" is a standalone bill for anything not tied to trip entries — a
   * hand-entered amount under "OTHER BILLING", numbered in the same
   * sequence as everything else billed to this party/company.
   */
  kind?: "trip" | "other";
  /**
   * Inward and outward trips are billed separately — one bill never mixes
   * the two. A trip invoice only pulls entries running in this direction.
   * Absent on invoices raised before the split existed.
   */
  direction?: Direction;
  entryIds: string[];
  freightAmount: number;
  sgstPercent?: number;
  cgstPercent?: number;
  /** Transport is normally reverse-charge — the party pays GST. */
  gstPaidByParty: boolean;
  total: number;
  notes?: string;
  createdAt: string;
}

/** Our own details, printed on every invoice. */
export interface CompanyProfile {
  shree: string;
  name: string;
  address: string;
  email: string;
  phone: string;
  pan: string;
  gstin?: string;
  /** Leading segment of every invoice number, e.g. "CST". */
  invoicePrefix?: string;
  logo?: string;
}

export interface DB {
  parties: Party[];
  companies: Company[];
  drivers: Driver[];
  vehicles: Vehicle[];
  entries: Entry[];
  invoices: Invoice[];
  company: CompanyProfile;
}

/* --------------------------------------------------------------- user access */

/**
 * A module a staff account can be let into. The dashboard and the users
 * screen aren't on this list on purpose — both are owner-only, since one is
 * the income summary and the other hands out access.
 */
export type Permission =
  | "entries"
  | "invoices"
  | "vehicles"
  | "drivers"
  | "companies"
  | "parties"
  | "reports"
  | "settings";

export const PERMISSIONS: { key: Permission; label: string; hint: string }[] = [
  { key: "entries", label: "Entries", hint: "Record trips. Edits need your approval." },
  { key: "invoices", label: "Invoices", hint: "Raise and print bills." },
  { key: "vehicles", label: "Vehicles", hint: "Fleet records and standing costs." },
  { key: "drivers", label: "Drivers", hint: "Driver records, pay and advances." },
  { key: "companies", label: "Companies", hint: "Billing groups." },
  { key: "parties", label: "Parties", hint: "The parties you bill." },
  { key: "reports", label: "Reports", hint: "Earnings roll-ups. Shows money." },
  { key: "settings", label: "Settings", hint: "Letterhead, backup, reset. Powerful." },
];

/**
 * An account that can sign in. `owner` sees everything and approves changes;
 * `staff` sees only the modules ticked in `permissions`.
 *
 * The password never lives here — Supabase Auth holds it. `id` is the Supabase
 * auth user's id, so the two always line up.
 */
export interface AppUser {
  id: string;
  username: string;
  name: string;
  role: "owner" | "staff";
  permissions: Permission[];
  active: boolean;
  createdAt: string;
}

/**
 * A staff edit or delete waiting on the owner's say-so.
 *
 * Staff can add entries freely, but they can't quietly change one after the
 * fact — the change is parked here with a before/after snapshot until the
 * owner approves it.
 */
export interface ChangeRequest {
  id: string;
  userId?: string;
  userName: string;
  kind: "update" | "delete";
  entity: "entries";
  recordId: string;
  /** The row as it would be after the change. Absent on a delete request. */
  payload?: Entry;
  /** The row as it stood when the request was raised, for the diff. */
  previous?: Entry;
  summary: string;
  status: "pending" | "approved" | "rejected";
  note?: string;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
}

/** One line in the owner's audit trail of what staff have been doing. */
export interface ActivityEvent {
  id: string;
  userId?: string;
  userName: string;
  action: "create" | "update" | "delete" | "request" | "approve" | "reject";
  entity: string;
  recordId?: string;
  summary: string;
  at: string;
}
