"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CompanyProfile, DB, Driver, Entry, Invoice, Party } from "./types";
import { DEFAULT_COMPANY, repo, type TableName } from "./repo";
import { entryTotal, inRange, num, round2, uid } from "./calc";

interface StoreValue {
  ready: boolean;
  error: string | null;
  backend: "local" | "supabase";
  db: DB;

  parties: Party[];
  drivers: Driver[];
  entries: Entry[];
  invoices: Invoice[];
  company: CompanyProfile;

  partyName: (id?: string) => string;
  driverName: (id?: string) => string;
  vehicleNumbers: string[];
  consignees: string[];

  saveParty: (p: Party) => Promise<void>;
  deleteParty: (id: string) => Promise<void>;
  saveDriver: (d: Driver) => Promise<void>;
  deleteDriver: (id: string) => Promise<void>;
  saveEntry: (e: Entry) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  saveInvoice: (i: Invoice, linkedEntryIds: string[]) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
  saveCompany: (c: CompanyProfile) => Promise<void>;

  /** Unbilled entries for a party inside a date range — what an invoice pulls in. */
  entriesFor: (partyId: string, from: string, to: string, includeInvoiceId?: string) => Entry[];
  nextInvoiceNo: () => string;
  nextEntryInvoiceNo: () => string;

  importDB: (db: DB) => Promise<void>;
  resetAll: () => Promise<void>;
}

const Ctx = createContext<StoreValue | null>(null);

const EMPTY: DB = { parties: [], drivers: [], entries: [], invoices: [], company: DEFAULT_COMPANY };

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB>(EMPTY);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    },
    [db, commit, upsert]
  );

  const deleteParty = useCallback(
    async (id: string) => {
      await commit({ ...db, parties: db.parties.filter((p) => p.id !== id) }, () =>
        repo.remove("parties", id)
      );
    },
    [db, commit]
  );

  const saveDriver = useCallback(
    async (d: Driver) => {
      const { nextList, exists } = upsert("drivers", db.drivers, d);
      await commit({ ...db, drivers: nextList }, () =>
        exists ? repo.update("drivers", d) : repo.insert("drivers", d)
      );
    },
    [db, commit, upsert]
  );

  const deleteDriver = useCallback(
    async (id: string) => {
      await commit({ ...db, drivers: db.drivers.filter((d) => d.id !== id) }, () =>
        repo.remove("drivers", id)
      );
    },
    [db, commit]
  );

  const saveEntry = useCallback(
    async (e: Entry) => {
      const { nextList, exists } = upsert("entries", db.entries, e);
      await commit({ ...db, entries: nextList }, () =>
        exists ? repo.update("entries", e) : repo.insert("entries", e)
      );
    },
    [db, commit, upsert]
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

      const touched: Invoice[] = [];
      const nextInvoices = db.invoices.map((inv) => {
        if (!inv.entryIds.includes(id)) return inv;

        const entryIds = inv.entryIds.filter((x) => x !== id);
        const freightAmount = round2(
          entryIds.reduce((sum, eid) => {
            const e = byId.get(eid);
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

      await commit({ ...db, entries: nextEntries, invoices: nextInvoices }, async () => {
        await repo.remove("entries", id);
        for (const inv of touched) await repo.update("invoices", inv);
      });
    },
    [db, commit]
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
    },
    [db, commit, upsert]
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
      await commit(
        { ...db, invoices: db.invoices.filter((i) => i.id !== id), entries: nextEntries },
        async () => {
          await repo.remove("invoices", id);
          for (const e of released) await repo.update("entries", e);
        }
      );
    },
    [db, commit]
  );

  const saveCompany = useCallback(
    async (c: CompanyProfile) => {
      await commit({ ...db, company: c }, () => repo.saveCompany(c));
    },
    [db, commit]
  );

  const importDB = useCallback(
    async (next: DB) => {
      await commit(next, () => repo.replaceAll(next));
    },
    [commit]
  );

  const resetAll = useCallback(async () => {
    const next: DB = { ...EMPTY, company: db.company };
    await commit(next, () => repo.replaceAll(next));
  }, [db.company, commit]);

  const partyById = useMemo(() => new Map(db.parties.map((p) => [p.id, p])), [db.parties]);
  const driverById = useMemo(() => new Map(db.drivers.map((d) => [d.id, d])), [db.drivers]);

  const vehicleNumbers = useMemo(() => {
    const s = new Set<string>();
    db.entries.forEach((e) => e.vehicleNo && s.add(e.vehicleNo.toUpperCase()));
    return [...s].sort();
  }, [db.entries]);

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

  /** Highest numeric invoice number seen, plus one. */
  const nextInvoiceNo = useCallback(() => {
    let max = 0;
    for (const i of db.invoices) {
      const m = String(i.invoiceNo).match(/(\d+)\s*$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return String(max + 1);
  }, [db.invoices]);

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
    drivers: db.drivers,
    entries: db.entries,
    invoices: db.invoices,
    company: db.company,
    partyName: (id) => (id && partyById.get(id)?.name) || "—",
    driverName: (id) => (id && driverById.get(id)?.name) || "—",
    vehicleNumbers,
    consignees,
    saveParty,
    deleteParty,
    saveDriver,
    deleteDriver,
    saveEntry,
    deleteEntry,
    saveInvoice,
    deleteInvoice,
    saveCompany,
    entriesFor,
    nextInvoiceNo,
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
