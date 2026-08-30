// Domain model — exactly the fields Vedant specified, nothing more.

export type Direction = "outward" | "inward";

/** A free-form cost the driver incurred on a trip: diesel, toll, anything. */
export interface ExpenseLine {
  id: string;
  label: string;
  amount: number;
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

  /** Expenses borne by the driver on this trip. Never billed to the party. */
  expenses: ExpenseLine[];

  ackPhoto?: string; // acknowledgment photo, data URL
  remarks?: string;

  /** Set once this entry has been pulled into a generated invoice. */
  invoiceId?: string;

  createdAt: string;
}

export interface Invoice {
  id: string;
  invoiceNo: string; // auto 1, 2, 3... always editable
  date: string;
  partyId: string;
  fromDate: string;
  toDate: string;
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
  logo?: string;
}

export interface DB {
  parties: Party[];
  drivers: Driver[];
  entries: Entry[];
  invoices: Invoice[];
  company: CompanyProfile;
}
