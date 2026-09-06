import type { Entry, Vehicle } from "./types";
import {
  entryDriverExpenses,
  entryNet,
  entryTotal,
  entryVehicleExpenses,
  inRange,
  num,
  round2,
} from "./calc";

/** The figures every report rolls up to, whatever it's grouped by. */
export interface Totals {
  trips: number;
  qty: number;
  billed: number;
  detention: number;
  vehicleExp: number;
  driverExp: number;
  /** Vehicle costs not attached to a trip (servicing, insurance...). */
  standingExp: number;
  net: number;
}

export function emptyTotals(): Totals {
  return {
    trips: 0,
    qty: 0,
    billed: 0,
    detention: 0,
    vehicleExp: 0,
    driverExp: 0,
    standingExp: 0,
    net: 0,
  };
}

/**
 * Net split by direction — inward and outward are separate businesses, so
 * they're reported separately rather than netted off against each other.
 */
export function netByDirection(entries: Entry[]): { inward: number; outward: number } {
  let inward = 0;
  let outward = 0;
  for (const e of entries) {
    if ((e.direction ?? "outward") === "inward") inward += entryNet(e);
    else outward += entryNet(e);
  }
  return { inward: round2(inward), outward: round2(outward) };
}

export function addEntry(t: Totals, e: Entry): Totals {
  t.trips += 1;
  t.qty += num(e.qty);
  t.billed += entryTotal(e);
  t.detention += num(e.detention);
  t.vehicleExp += entryVehicleExpenses(e);
  t.driverExp += entryDriverExpenses(e);
  t.net += entryNet(e);
  return t;
}

export function roundTotals(t: Totals): Totals {
  return {
    trips: t.trips,
    qty: round2(t.qty),
    billed: round2(t.billed),
    detention: round2(t.detention),
    vehicleExp: round2(t.vehicleExp),
    driverExp: round2(t.driverExp),
    standingExp: round2(t.standingExp),
    net: round2(t.net - t.standingExp),
  };
}

export function totalsFor(entries: Entry[], standingExp = 0): Totals {
  const t = entries.reduce(addEntry, emptyTotals());
  t.standingExp = standingExp;
  return roundTotals(t);
}

/** Vehicle costs entered by hand, inside a date window. */
export function standingExpenses(vehicle: Vehicle | undefined, from: string, to: string): number {
  return round2(
    (vehicle?.expenses ?? [])
      .filter((x) => inRangeLoose(x.date, from, to))
      .reduce((s, x) => s + num(x.amount), 0)
  );
}

/** inRange, but treats an empty bound as "no bound". */
export function inRangeLoose(date: string, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!from) return date <= to;
  if (!to) return date >= from;
  return inRange(date, from, to);
}

export interface GroupRow<K = string> {
  key: K;
  label: string;
  totals: Totals;
}

/** Group entries by any key, then roll each group up. */
export function groupBy(
  entries: Entry[],
  keyOf: (e: Entry) => string,
  labelOf: (key: string) => string
): GroupRow[] {
  const map = new Map<string, Totals>();
  for (const e of entries) {
    const k = keyOf(e);
    if (!k) continue;
    map.set(k, addEntry(map.get(k) ?? emptyTotals(), e));
  }
  return [...map.entries()]
    .map(([key, t]) => ({ key, label: labelOf(key), totals: roundTotals(t) }))
    .sort((a, b) => b.totals.billed - a.totals.billed);
}
