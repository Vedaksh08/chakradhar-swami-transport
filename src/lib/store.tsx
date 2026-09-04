"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Company, CompanyProfile, DB, Driver, Entry, Invoice, Party, Vehicle } from "./types";
import { DEFAULT_COMPANY, repo, type TableName } from "./repo";
import { useAccess } from "./access";
import { buildInvoiceNo, entryTotal, inRange, num, round2, uid } from "./calc";

interface StoreValue {
  ready: boolean;
  error: string | null;
  backend: "local" | "supabase";
  db: DB;

  parties: Party[];
  companies: Company[];
  drivers: Driver[];
  vehicles: Vehicle[];
  entries: Entry[];
  invoices: Invoice[];
  company: CompanyProfile;

  partyName: (id?: string) => string;
  companyName: (id?: string) => string;
  driverName: (id?: string) => string;
  /** Every registration seen — fleet records plus anything typed on an entry. */
  vehicleNumbers: string[];
  consignees: string[];

  saveParty: (p: Party) => Promise<void>;
  deleteParty: (id: string) => Promise<void>;
  saveCompanyEntity: (c: Company) => Promise<void>;
  deleteCompanyEntity: (id: string) => Promise<void>;
  saveDriver: (d: Driver) => Promise<void>;
  deleteDriver: (id: string) => Promise<void>;
  saveVehicle: (v: Vehicle) => Promise<void>;
  deleteVehicle: (id: string) => Promise<void>;
  saveEntry: (e: Entry) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  saveInvoice: (i: Invoice, linkedEntryIds: string[]) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
  /** Your own letterhead details, printed on every invoice. */
  saveCompanyProfile: (c: CompanyProfile) => Promise<void>;

  /** Unbilled entries for a party inside a date range — what an invoice pulls in. */
  entriesFor: (partyId: string, from: string, to: string, includeInvoiceId?: string) => Entry[];
  /** Same, but across every party under a billing company. */
  entriesForCompany: (
    companyId: string,
    from: string,
    to: string,
    includeInvoiceId?: string
  ) => Entry[];
  /** Next invoice number in the CST/MTC/01/26-27 house format. */
  nextInvoiceNo: (partyId: string, dateISO: string) => string;
  nextInvoiceNoForCompany: (companyId: string, dateISO: string) => string;
  nextEntryInvoiceNo: () => string;

  importDB: (db: DB) => Promise<void>;
  resetAll: () => Promise<void>;
}

const Ctx = createContext<StoreValue | null>(null);

const EMPTY: DB = {
  parties: [],
  companies: [],
  drivers: [],
  vehicles: [],
  entries: [],
  invoices: [],
  company: DEFAULT_COMPANY,
};

/**
 * Drops the given entries from every invoice that references them and
 * re-totals what's left. Shared by single-entry deletion and by cascading
 * deletes (party, company) that take a batch of entries with them — without
 * this, an invoice would keep dead ids in `entryIds` and a total that no
 * longer matches its own annexure.
 */
function recomputeInvoices(
  invoices: Invoice[],
  removedEntryIds: Set<string>,
  remainingById: Map<string, Entry>
): { nextInvoices: Invoice[]; touched: Invoice[] } {
  const touched: Invoice[] = [];
  const nextInvoices = invoices.map((inv) => {
    if (!inv.entryIds.some((id) => removedEntryIds.has(id))) return inv;

    const entryIds = inv.entryIds.filter((id) => !removedEntryIds.has(id));
    const freightAmount = round2(
      entryIds.reduce((sum, eid) => {
        const e = remainingById.get(eid);
        return sum + (e ? entryTotal(e) : 0);
      }, 0)
    );
    const gst = inv.gstPaidByParty
      ? 0
      : round2((freightAmount * (num(inv.sgstPercent) + num(inv.cgstPercent))) / 100);

    const updated: Invoice = {
      ...inv,
      entryIds,
      freightAmount,
      total: round2(freightAmount + gst),
    };
    touched.push(updated);
    return updated;
  });
  return { nextInvoices, touched };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB>(EMPTY);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isOwner, log } = useAccess();

  /**
   * Records what a staff account changed, so the owner can read it back on
   * the Users screen. The owner's own work isn't logged — the trail exists to
   * show what everybody else has been doing.
   */
  const audit = useCallback(
    (action: "create" | "update" | "delete", entity: string, id: string, summary: string) => {
      if (isOwner) return;
      void log(action, entity, id, summary);
    },
    [isOwner, log]
  );

  useEffect(() => {
    let alive = true;
    repo
      .load()
      .then((loaded) => {
        if (alive) setDb(loaded);
      })
      .catch((e) => {
        if (alive) setError(e?.message ?? String(e));
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  /** Apply to local state first (instant UI), then persist. */
  const commit = useCallback(
    async (next: DB, work: () => Promise<void>) => {
      setDb(next);
      try {
        await work();
        setError(null);
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    },
    []
  );

  const upsert = useCallback(
    <T extends { id: string }>(table: TableName, list: T[], row: T) => {
      const exists = list.some((r) => r.id === row.id);
      const nextList = exists ? list.map((r) => (r.id === row.id ? row : r)) : [...list, row];
      return { nextList, exists };
    },
    []
  );

  const saveParty = useCallback(
    async (p: Party) => {
      const { nextList, exists } = upsert("parties", db.parties, p);
      await commit({ ...db, parties: nextList }, () =>
        exists ? repo.update("parties", p) : repo.insert("parties", p)
      );
      audit(exists ? "update" : "create", "parties", p.id, p.name);
    },
    [db, commit, upsert, audit]
  );

  /**
   * Deleting a party takes its entries with it, and any invoice billed
   * directly to it. Invoices billed to a *company* that happened to include
   * this party's entries aren't deleted — they're re-totalled, the same way
   * a single entry delete re-totals its invoice.
   *
   * The database's foreign keys restrict deleting a party that still has
   * entries or invoices pointing at it — without this, a party with any
   * trip history could never be removed. Children go first so the party
   * delete never hits that restriction.
   */
  const deleteParty = useCallback(
    async (id: string) => {
      const removedEntryIds = new Set(
        db.entries.filter((e) => e.partyId === id).map((e) => e.id)
      );
      const nextEntries = db.entries.filter((e) => !removedEntryIds.has(e.id));
      const remainingById = new Map(nextEntries.map((e) => [e.id, e]));

      const directInvoiceIds = db.invoices.filter((i) => i.partyId === id).map((i) => i.id);
      const otherInvoices = db.invoices.filter((i) => i.partyId !== id);
      const { nextInvoices, touched } = recomputeInvoices(
        otherInvoices,
        removedEntryIds,
        remainingById
      );

      await commit(
        {
          ...db,
          parties: db.parties.filter((p) => p.id !== id),
          entries: nextEntries,
          invoices: nextInvoices,
        },
        async () => {
          for (const eid of removedEntryIds) await repo.remove("entries", eid);
          for (const iid of directInvoiceIds) await repo.remove("invoices", iid);
          for (const inv of touched) await repo.update("invoices", inv);
          await repo.remove("parties", id);
        }
      );
      audit("delete", "parties", id, db.parties.find((p) => p.id === id)?.name ?? id);
    },
    [db, commit, audit]
  );

  const saveCompanyEntity = useCallback(
    async (c: Company) => {
      const { nextList, exists } = upsert("companies", db.companies, c);
      await commit({ ...db, companies: nextList }, () =>
        exists ? repo.update("companies", c) : repo.insert("companies", c)
      );
      audit(exists ? "update" : "create", "companies", c.id, c.name);
    },
    [db, commit, upsert, audit]
  );

  /**
   * Deleting a company ungroups its parties (they, and their entries and
   * trip history, are untouched) but removes any invoice billed to the
   * company — a bill made out to a company that no longer exists doesn't
   * mean anything. Those entries go back to the unbilled pool, same as
   * deleting any other invoice.
   */
  const deleteCompanyEntity = useCallback(
    async (id: string) => {
      const ownInvoiceIds = db.invoices.filter((i) => i.companyId === id).map((i) => i.id);
      const ownInvoiceIdSet = new Set(ownInvoiceIds);

      const releasedEntries: Entry[] = [];
      const nextEntries = db.entries.map((e) => {
        if (!e.invoiceId || !ownInvoiceIdSet.has(e.invoiceId)) return e;
        const u = { ...e, invoiceId: undefined };
        releasedEntries.push(u);
        return u;
      });

      const ungroupedParties: Party[] = [];
      const nextParties = db.parties.map((p) => {
        if (p.companyId !== id) return p;
        const u = { ...p, companyId: undefined };
        ungroupedParties.push(u);
        return u;
      });

      await commit(
        {
          ...db,
          companies: db.companies.filter((c) => c.id !== id),
          parties: nextParties,
          invoices: db.invoices.filter((i) => i.companyId !== id),
          entries: nextEntries,
        },
        async () => {
          for (const e of releasedEntries) await repo.update("entries", e);
          for (const iid of ownInvoiceIds) await repo.remove("invoices", iid);
          for (const p of ungroupedParties) await repo.update("parties", p);
          await repo.remove("companies", id);
        }
      );
      audit("delete", "companies", id, db.companies.find((c) => c.id === id)?.name ?? id);
    },
    [db, commit, audit]
  );

  const saveDriver = useCallback(
    async (d: Driver) => {
      const { nextList, exists } = upsert("drivers", db.drivers, d);
      await commit({ ...db, drivers: nextList }, () =>
        exists ? repo.update("drivers", d) : repo.insert("drivers", d)
      );
      audit(exists ? "update" : "create", "drivers", d.id, d.name);
    },
    [db, commit, upsert, audit]
  );

  const deleteDriver = useCallback(
    async (id: string) => {
      await commit({ ...db, drivers: db.drivers.filter((d) => d.id !== id) }, () =>
        repo.remove("drivers", id)
      );
      audit("delete", "drivers", id, db.drivers.find((d) => d.id === id)?.name ?? id);
    },
    [db, commit, audit]
  );

  const saveVehicle = useCallback(
    async (v: Vehicle) => {
      const row = { ...v, number: v.number.trim().toUpperCase() };
      const { nextList, exists } = upsert("vehicles", db.vehicles, row);
      await commit({ ...db, vehicles: nextList }, () =>
        exists ? repo.update("vehicles", row) : repo.insert("vehicles", row)
      );
      audit(exists ? "update" : "create", "vehicles", row.id, row.number);
    },
    [db, commit, upsert, audit]
  );

  const deleteVehicle = useCallback(
    async (id: string) => {
      await commit({ ...db, vehicles: db.vehicles.filter((v) => v.id !== id) }, () =>
        repo.remove("vehicles", id)
      );
      audit("delete", "vehicles", id, db.vehicles.find((v) => v.id === id)?.number ?? id);
    },
    [db, commit, audit]
  );

  const saveEntry = useCallback(
    async (e: Entry) => {
      const { nextList, exists } = upsert("entries", db.entries, e);
      await commit({ ...db, entries: nextList }, () =>
        exists ? repo.update("entries", e) : repo.insert("entries", e)
      );
      audit(
        exists ? "update" : "create",
        "entries",
        e.id,
        `Entry ${e.invoiceNo} · ${e.date} · ${e.vehicleNo}`
      );
    },
    [db, commit, upsert, audit]
  );

  /**
   * Deleting an entry removes it everywhere it is referenced.
   *
   * Without this, an invoice would keep the dead id in `entryIds` and hold a
   * total that no longer matches its own annexure — a wrong number on a
   * financial document. Any invoice that included the entry is re-totalled
   * from the entries that actually remain.
   */
  const deleteEntry = useCallback(
    async (id: string) => {
      const nextEntries = db.entries.filter((e) => e.id !== id);
      const byId = new Map(nextEntries.map((e) => [e.id, e]));
      const { nextInvoices, touched } = recomputeInvoices(db.invoices, new Set([id]), byId);

      const gone = db.entries.find((e) => e.id === id);
      await commit({ ...db, entries: nextEntries, invoices: nextInvoices }, async () => {
        await repo.remove("entries", id);
        for (const inv of touched) await repo.update("invoices", inv);
      });
      audit("delete", "entries", id, gone ? `Entry ${gone.invoiceNo} · ${gone.date}` : id);
    },
    [db, commit, audit]
  );

  /** Saving an invoice also stamps invoiceId onto every entry it covers. */
  const saveInvoice = useCallback(
    async (inv: Invoice, linkedEntryIds: string[]) => {
      const { nextList, exists } = upsert("invoices", db.invoices, inv);
      const linked = new Set(linkedEntryIds);
      const changed: Entry[] = [];
      const nextEntries = db.entries.map((e) => {
        const shouldLink = linked.has(e.id);
        const currentlyLinked = e.invoiceId === inv.id;
        if (shouldLink && !currentlyLinked) {
          const u = { ...e, invoiceId: inv.id };
          changed.push(u);
          return u;
        }
        if (!shouldLink && currentlyLinked) {
          const u = { ...e, invoiceId: undefined };
          changed.push(u);
          return u;
        }
        return e;
      });

      await commit({ ...db, invoices: nextList, entries: nextEntries }, async () => {
        if (exists) await repo.update("invoices", inv);
        else await repo.insert("invoices", inv);
        for (const e of changed) await repo.update("entries", e);
      });
      audit(exists ? "update" : "create", "invoices", inv.id, `Invoice ${inv.invoiceNo}`);
    },
    [db, commit, upsert, audit]
  );

  /** Deleting an invoice releases its entries back into the unbilled pool. */
  const deleteInvoice = useCallback(
    async (id: string) => {
      const released: Entry[] = [];
      const nextEntries = db.entries.map((e) => {
        if (e.invoiceId !== id) return e;
        const u = { ...e, invoiceId: undefined };
        released.push(u);
        return u;
      });
      const gone = db.invoices.find((i) => i.id === id);
      await commit(
        { ...db, invoices: db.invoices.filter((i) => i.id !== id), entries: nextEntries },
        async () => {
          await repo.remove("invoices", id);
          for (const e of released) await repo.update("entries", e);
        }
      );
      audit("delete", "invoices", id, gone ? `Invoice ${gone.invoiceNo}` : id);
    },
    [db, commit, audit]
  );

  const saveCompanyProfile = useCallback(
    async (c: CompanyProfile) => {
      await commit({ ...db, company: c }, () => repo.saveCompany(c));
      audit("update", "settings", "company", "Company details");
    },
    [db, commit, audit]
  );

  const importDB = useCallback(
    async (next: DB) => {
      await commit(next, () => repo.replaceAll(next));
    },
    [commit]
  );

  /** Wipes everything, company profile included — a true factory reset. */
  const resetAll = useCallback(async () => {
    const next: DB = { ...EMPTY, company: { ...DEFAULT_COMPANY } };
    await commit(next, () => repo.replaceAll(next));
  }, [commit]);

  const partyById = useMemo(() => new Map(db.parties.map((p) => [p.id, p])), [db.parties]);
  const companyById = useMemo(() => new Map(db.companies.map((c) => [c.id, c])), [db.companies]);
  const driverById = useMemo(() => new Map(db.drivers.map((d) => [d.id, d])), [db.drivers]);

  const vehicleNumbers = useMemo(() => {
    const s = new Set<string>();
    db.vehicles.forEach((v) => v.number && s.add(v.number.toUpperCase()));
    db.entries.forEach((e) => e.vehicleNo && s.add(e.vehicleNo.toUpperCase()));
    return [...s].sort();
  }, [db.entries, db.vehicles]);

  /** Previously used delivery names, offered as suggestions on the entry form. */
  const consignees = useMemo(() => {
    const s = new Set<string>();
    db.entries.forEach((e) => e.consignee && s.add(e.consignee.toUpperCase()));
    return [...s].sort();
  }, [db.entries]);

  const entriesFor = useCallback(
    (partyId: string, from: string, to: string, includeInvoiceId?: string) =>
      db.entries
        .filter(
          (e) =>
            e.partyId === partyId &&
            inRange(e.date, from, to) &&
            (!e.invoiceId || e.invoiceId === includeInvoiceId)
        )
        .sort((a, b) => a.date.localeCompare(b.date)),
    [db.entries]
  );

  /** Same as `entriesFor`, but pooled across every party under a company. */
  const entriesForCompany = useCallback(
    (companyId: string, from: string, to: string, includeInvoiceId?: string) => {
      const memberIds = new Set(
        db.parties.filter((p) => p.companyId === companyId).map((p) => p.id)
      );
      return db.entries
        .filter(
          (e) =>
            memberIds.has(e.partyId) &&
            inRange(e.date, from, to) &&
            (!e.invoiceId || e.invoiceId === includeInvoiceId)
        )
        .sort((a, b) => a.date.localeCompare(b.date));
    },
    [db.entries, db.parties]
  );

  /**
   * Next number in the house format, e.g. CST/MTC/01/26-27.
   *
   * Parties don't carry a code of their own — the code belongs to the
   * company they sit under, so a party billed directly borrows it and the
   * number stays recognisable. A party with no company just gets
   * CST/01/26-27.
   */
  const nextInvoiceNo = useCallback(
    (partyId: string, dateISO: string) => {
      const parent = partyById.get(partyId)?.companyId;
      return buildInvoiceNo(
        db.company.invoicePrefix ?? "CST",
        parent ? companyById.get(parent)?.code : undefined,
        dateISO,
        db.invoices,
        partyId
      );
    },
    [db.invoices, db.company.invoicePrefix, partyById, companyById]
  );

  /** Same, but numbering off the company's code and its own invoice history. */
  const nextInvoiceNoForCompany = useCallback(
    (companyId: string, dateISO: string) =>
      buildInvoiceNo(
        db.company.invoicePrefix ?? "CST",
        companyById.get(companyId)?.code,
        dateISO,
        db.invoices,
        companyId
      ),
    [db.invoices, db.company.invoicePrefix, companyById]
  );

  const nextEntryInvoiceNo = useCallback(() => {
    let max = 0;
    for (const e of db.entries) {
      const m = String(e.invoiceNo).match(/(\d+)\s*$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return String(max + 1);
  }, [db.entries]);

  const value: StoreValue = {
    ready,
    error,
    backend: repo.kind,
    db,
    parties: db.parties,
    companies: db.companies,
    drivers: db.drivers,
    vehicles: db.vehicles,
    entries: db.entries,
    invoices: db.invoices,
    company: db.company,
    partyName: (id) => (id && partyById.get(id)?.name) || "—",
    companyName: (id) => (id && companyById.get(id)?.name) || "—",
    driverName: (id) => (id && driverById.get(id)?.name) || "—",
    vehicleNumbers,
    consignees,
    saveParty,
    deleteParty,
    saveCompanyEntity,
    deleteCompanyEntity,
    saveDriver,
    deleteDriver,
    saveVehicle,
    deleteVehicle,
    saveEntry,
    deleteEntry,
    saveInvoice,
    deleteInvoice,
    saveCompanyProfile,
    entriesFor,
    entriesForCompany,
    nextInvoiceNo,
    nextInvoiceNoForCompany,
    nextEntryInvoiceNo,
    importDB,
    resetAll,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore must be used inside <StoreProvider>");
  return v;
}

export { uid, entryTotal };
