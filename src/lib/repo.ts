import type { CompanyProfile, DB, Entry } from "./types";
import { getSupabase, supabaseConfigured } from "./supabase";

export type TableName = "parties" | "companies" | "drivers" | "vehicles" | "entries" | "invoices";

export const DEFAULT_COMPANY: CompanyProfile = {
  shree: "श्री",
  name: "CHAKRADHAR SWAMI TRANSPORT",
  address:
    '"SARVDNYA" Niwas, Near Rupali Laundry, Opp. Sai Puja Baug Soc., Dattawadi, Akurdi, Pune – 411 035',
  email: "hiraman.man@gmail.com",
  phone: "9922961795-96 / 9090903065",
  pan: "ADUPN4917E",
  gstin: "",
  invoicePrefix: "CST",
};

const STORAGE_KEY = "cst.transport.db.v1";

function emptyDB(): DB {
  return {
    parties: [],
    companies: [],
    drivers: [],
    vehicles: [],
    entries: [],
    invoices: [],
    company: { ...DEFAULT_COMPANY },
  };
}

/**
 * Bring older rows up to the current shape.
 *
 * Entries used to carry a single `expenses` list and one `ackPhoto`. Those are
 * now split into driver/vehicle expenses and a list of named photos. Existing
 * costs land under vehicle expenses, since diesel and toll were the bulk of
 * what was recorded there.
 */
export function normaliseEntry(raw: any): Entry {
  const legacyExpenses = Array.isArray(raw?.expenses) ? raw.expenses : null;

  const photos = Array.isArray(raw?.photos)
    ? raw.photos
    : raw?.ackPhoto
      ? [{ id: `${raw.id}-ack`, name: "Acknowledgment", src: raw.ackPhoto }]
      : [];

  return {
    ...raw,
    driverExpenses: Array.isArray(raw?.driverExpenses) ? raw.driverExpenses : [],
    vehicleExpenses: Array.isArray(raw?.vehicleExpenses)
      ? raw.vehicleExpenses
      : (legacyExpenses ?? []),
    photos,
  } as Entry;
}

/**
 * Storage abstraction. Local browser storage is the default so the app is
 * fully usable with no backend; the Supabase implementation takes over
 * automatically once keys are configured.
 */
export interface Repo {
  readonly kind: "local" | "supabase";
  load(): Promise<DB>;
  insert<T extends { id: string }>(table: TableName, row: T): Promise<void>;
  update<T extends { id: string }>(table: TableName, row: T): Promise<void>;
  remove(table: TableName, id: string): Promise<void>;
  saveCompany(c: CompanyProfile): Promise<void>;
  replaceAll(db: DB): Promise<void>;
  /** Adds rows that aren't there yet. Never overwrites, never deletes. */
  merge(incoming: DB, existing: DB): Promise<MergeCounts>;
}

export type MergeCounts = Partial<Record<TableName, number>>;

/* ------------------------------------------------- browser-storage leftovers */

/**
 * Data left in this browser from before the cloud database was connected.
 *
 * With no Supabase keys the app quietly keeps everything in localStorage,
 * which means every person and every device ends up with a private copy.
 * Once the keys arrive that data is still sitting there, invisible — so the
 * app offers to lift it into the shared database rather than stranding it.
 */
export function readLocalDB(): DB | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DB>;
    const db: DB = {
      parties: parsed.parties ?? [],
      companies: parsed.companies ?? [],
      drivers: parsed.drivers ?? [],
      vehicles: parsed.vehicles ?? [],
      entries: (parsed.entries ?? []).map(normaliseEntry),
      invoices: parsed.invoices ?? [],
      company: { ...DEFAULT_COMPANY, ...(parsed.company ?? {}) },
    };
    return countRows(db) > 0 ? db : null;
  } catch {
    return null;
  }
}

export function countRows(db: DB): number {
  return (
    db.parties.length +
    db.companies.length +
    db.drivers.length +
    db.vehicles.length +
    db.entries.length +
    db.invoices.length
  );
}

/** Drops the browser copy once it's safely in the shared database. */
export function clearLocalDB() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/**
 * Parents before children, so a row never lands before the row it points at.
 * Same order `replaceAll` seeds in.
 */
const MERGE_ORDER: TableName[] = [
  "companies",
  "parties",
  "drivers",
  "vehicles",
  "invoices",
  "entries",
];

/**
 * The columns each table actually has.
 *
 * Rows coming out of browser storage can carry leftovers the database never
 * had — an entry saved years ago still has its old `expenses` key, and
 * Postgres rejects the whole insert over one unknown column. Anything not on
 * this list is dropped on the way up.
 */
const COLUMNS: Record<TableName, string[]> = {
  companies: [
    "id", "name", "code", "address", "gstin", "pan",
    "contactPerson", "phone", "email", "notes", "createdAt",
  ],
  parties: [
    "id", "name", "code", "address", "gstin", "pan",
    "contactPerson", "phone", "email", "notes", "companyId", "createdAt",
  ],
  drivers: [
    "id", "name", "address", "phone", "licenceNo", "panNo", "aadhaarNo",
    "policeVerification", "active", "notes", "monthlyPay", "advances", "docs", "createdAt",
  ],
  vehicles: [
    "id", "number", "make", "type", "ownerName", "capacityMt", "active", "notes",
    "insuranceExpiry", "fitnessExpiry", "permitExpiry", "pucExpiry", "expenses", "createdAt",
  ],
  invoices: [
    "id", "invoiceNo", "date", "partyId", "companyId", "fromDate", "toDate", "entryIds",
    "freightAmount", "sgstPercent", "cgstPercent", "gstPaidByParty", "total", "notes",
    "kind", "direction", "createdAt",
  ],
  entries: [
    "id", "direction", "invoiceNo", "date", "partyId", "consignee", "qty", "rate", "amount",
    "detention", "detentionRemark", "vehicleNo", "driverId", "driverExpenses",
    "vehicleExpenses", "photos", "remarks", "invoiceId", "createdAt",
  ],
};

/**
 * Columns typed as date or numeric. A form that was never filled in leaves ""
 * behind, which Postgres won't take for either — those become null.
 */
const NOT_TEXT: Record<TableName, string[]> = {
  companies: [],
  parties: [],
  drivers: ["monthlyPay"],
  vehicles: ["capacityMt", "insuranceExpiry", "fitnessExpiry", "permitExpiry", "pucExpiry"],
  invoices: ["freightAmount", "sgstPercent", "cgstPercent", "total", "date", "fromDate", "toDate"],
  entries: ["qty", "rate", "amount", "detention", "date"],
};

function sanitiseRow(table: TableName, row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const col of COLUMNS[table]) {
    if (!(col in row)) continue;
    const v = row[col];
    if (v === undefined) continue;
    out[col] = v === "" && NOT_TEXT[table].includes(col) ? null : v;
  }
  return out;
}

function missingRows(table: TableName, incoming: DB, existing: DB): Record<string, unknown>[] {
  const have = new Set((existing[table] as { id: string }[]).map((r) => r.id));
  return (incoming[table] as { id: string }[])
    .filter((r) => r.id && !have.has(r.id))
    .map((r) => sanitiseRow(table, r as unknown as Record<string, unknown>));
}

/* ------------------------------------------------------------------ local */

class LocalRepo implements Repo {
  readonly kind = "local" as const;

  private read(): DB {
    if (typeof window === "undefined") return emptyDB();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyDB();
      const parsed = JSON.parse(raw) as Partial<DB>;
      return {
        parties: parsed.parties ?? [],
        companies: parsed.companies ?? [],
        drivers: parsed.drivers ?? [],
        vehicles: parsed.vehicles ?? [],
        entries: (parsed.entries ?? []).map(normaliseEntry),
        invoices: parsed.invoices ?? [],
        company: { ...DEFAULT_COMPANY, ...(parsed.company ?? {}) },
      };
    } catch {
      return emptyDB();
    }
  }

  private write(db: DB) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }

  async load() {
    return this.read();
  }

  async insert<T extends { id: string }>(table: TableName, row: T) {
    const db = this.read();
    (db[table] as unknown as T[]).push(row);
    this.write(db);
  }

  async update<T extends { id: string }>(table: TableName, row: T) {
    const db = this.read();
    const arr = db[table] as unknown as T[];
    const i = arr.findIndex((r) => r.id === row.id);
    if (i >= 0) arr[i] = row;
    else arr.push(row);
    this.write(db);
  }

  async remove(table: TableName, id: string) {
    const db = this.read();
    const arr = db[table] as unknown as { id: string }[];
    const i = arr.findIndex((r) => r.id === id);
    if (i >= 0) arr.splice(i, 1);
    this.write(db);
  }

  async saveCompany(company: CompanyProfile) {
    const db = this.read();
    db.company = company;
    this.write(db);
  }

  async replaceAll(db: DB) {
    this.write(db);
  }

  async merge(incoming: DB, existing: DB): Promise<MergeCounts> {
    const db = this.read();
    const counts: MergeCounts = {};
    for (const t of MERGE_ORDER) {
      const add = missingRows(t, incoming, existing);
      if (!add.length) continue;
      (db[t] as unknown as unknown[]).push(...add);
      counts[t] = add.length;
    }
    this.write(db);
    return counts;
  }
}

/* --------------------------------------------------------------- supabase */

/**
 * Tables use the same camelCase column names as the TypeScript model
 * (quoted identifiers in supabase/schema.sql), so no field mapping is needed.
 */
class SupabaseRepo implements Repo {
  readonly kind = "supabase" as const;

  async load(): Promise<DB> {
    const sb = getSupabase()!;
    const [parties, companies, drivers, vehicles, entries, invoices, company] = await Promise.all([
      sb.from("parties").select("*"),
      sb.from("companies").select("*"),
      sb.from("drivers").select("*"),
      sb.from("vehicles").select("*"),
      sb.from("entries").select("*"),
      sb.from("invoices").select("*"),
      sb.from("company").select("*").eq("id", 1).maybeSingle(),
    ]);
    const err =
      parties.error ||
      companies.error ||
      drivers.error ||
      vehicles.error ||
      entries.error ||
      invoices.error;
    if (err) throw err;

    return {
      parties: parties.data ?? [],
      companies: companies.data ?? [],
      drivers: drivers.data ?? [],
      vehicles: vehicles.data ?? [],
      entries: (entries.data ?? []).map(normaliseEntry),
      invoices: invoices.data ?? [],
      company: { ...DEFAULT_COMPANY, ...(company.data ?? {}) },
    } as DB;
  }

  async insert<T extends { id: string }>(table: TableName, row: T) {
    const { error } = await getSupabase()!.from(table).insert(row);
    if (error) throw error;
  }

  async update<T extends { id: string }>(table: TableName, row: T) {
    const { error } = await getSupabase()!.from(table).upsert(row);
    if (error) throw error;
  }

  async remove(table: TableName, id: string) {
    const { error } = await getSupabase()!.from(table).delete().eq("id", id);
    if (error) throw error;
  }

  async saveCompany(company: CompanyProfile) {
    const { error } = await getSupabase()!.from("company").upsert({ id: 1, ...company });
    if (error) throw error;
  }

  async replaceAll(db: DB) {
    const sb = getSupabase()!;

    // Children before parents, so foreign keys never block the wipe.
    const wipeOrder: TableName[] = [
      "entries",
      "invoices",
      "parties",
      "companies",
      "drivers",
      "vehicles",
    ];
    for (const t of wipeOrder) {
      const { error } = await sb.from(t).delete().neq("id", "");
      // Surface it — a silent failure here would look like a successful wipe.
      if (error) throw new Error(`Could not clear ${t}: ${error.message}`);
    }

    const seed = async (t: TableName, rows: unknown[]) => {
      if (!rows.length) return;
      const { error } = await sb.from(t).insert(rows);
      if (error) throw new Error(`Could not restore ${t}: ${error.message}`);
    };

    // Companies before parties — parties can reference a company by id.
    await seed("companies", db.companies);
    await seed("parties", db.parties);
    await seed("drivers", db.drivers);
    await seed("vehicles", db.vehicles);
    await seed("invoices", db.invoices);
    await seed("entries", db.entries);
    await this.saveCompany(db.company);
  }

  /**
   * Lifts rows the cloud doesn't have yet into it. Anything already there is
   * left exactly as it is, so this is safe to run twice and can't clobber
   * work somebody else has done in the meantime.
   */
  async merge(incoming: DB, existing: DB): Promise<MergeCounts> {
    const sb = getSupabase()!;
    const counts: MergeCounts = {};

    for (const t of MERGE_ORDER) {
      const add = missingRows(t, incoming, existing);
      if (!add.length) continue;

      // Chunked: a few hundred entries with photo data is a big payload.
      for (let i = 0; i < add.length; i += 200) {
        const { error } = await sb.from(t).insert(add.slice(i, i + 200));
        if (error) throw new Error(`Could not upload ${t}: ${error.message}`);
      }
      counts[t] = add.length;
    }

    // The letterhead only moves up if the cloud is still on the defaults —
    // whatever is already saved there wins.
    const untouched =
      existing.company.name === DEFAULT_COMPANY.name && !existing.company.logo;
    if (untouched && incoming.company && incoming.company.name !== DEFAULT_COMPANY.name) {
      await this.saveCompany(incoming.company);
    }

    return counts;
  }
}

export const repo: Repo = supabaseConfigured ? new SupabaseRepo() : new LocalRepo();
