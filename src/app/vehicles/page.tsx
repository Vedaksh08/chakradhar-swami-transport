"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Truck, Plus, Search, ChevronRight, Pencil } from "lucide-react";
import type { Vehicle } from "@/lib/types";
import { useStore } from "@/lib/store";
import { inr, uid } from "@/lib/calc";
import { groupBy, standingExpenses, totalsFor } from "@/lib/report";
import { VehicleModal, blankVehicle } from "@/components/VehicleForm";
import {
  Card,
  Chip,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Stat,
  Table,
  Textarea,
  cx,
} from "@/components/ui";

export default function VehiclesPage() {
  const store = useStore();
  const { vehicles, entries, vehicleNumbers } = store;

  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Vehicle | null>(null);
  const [isNew, setIsNew] = useState(false);

  /** Registration -> its fleet record, if one exists. */
  const byNumber = useMemo(
    () => new Map(vehicles.map((v) => [v.number.toUpperCase(), v])),
    [vehicles]
  );

  /**
   * Every registration that has run, whether or not somebody created a fleet
   * record for it — otherwise a vehicle typed straight onto an entry would be
   * invisible here.
   */
  const rows = useMemo(() => {
    const perVehicle = groupBy(entries, (e) => e.vehicleNo.toUpperCase(), (k) => k);
    const seen = new Set(perVehicle.map((r) => r.key));

    const list = perVehicle.map((r) => {
      const v = byNumber.get(r.key);
      return {
        number: r.key,
        vehicle: v,
        totals: r.totals,
        standing: standingExpenses(v, "", ""),
      };
    });

    // Fleet records that haven't run yet still deserve a row.
    for (const v of vehicles) {
      const n = v.number.toUpperCase();
      if (seen.has(n)) continue;
      list.push({
        number: n,
        vehicle: v,
        totals: totalsFor([]),
        standing: standingExpenses(v, "", ""),
      });
    }

    return list.sort((a, b) => b.totals.billed - a.totals.billed || a.number.localeCompare(b.number));
  }, [entries, vehicles, byNumber]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return rows.filter((r) =>
      !n ? true : `${r.number} ${r.vehicle?.ownerName ?? ""} ${r.vehicle?.type ?? ""}`
        .toLowerCase()
        .includes(n)
    );
  }, [rows, q]);

  const fleetTotals = useMemo(
    () =>
      filtered.reduce(
        (a, r) => {
          a.trips += r.totals.trips;
          a.billed += r.totals.billed;
          a.expenses += r.totals.vehicleExp + r.standing;
          a.net += r.totals.net - r.standing;
          return a;
        },
        { trips: 0, billed: 0, expenses: 0, net: 0 }
      ),
    [filtered]
  );

  const unregistered = filtered.filter((r) => !r.vehicle).length;

  return (
    <>
      <PageHeader
        title="Vehicles"
        subtitle="Every vehicle that has run, what it earned and what it cost."
        actions={
          <button
            onClick={() => {
              setDraft(blankVehicle());
              setIsNew(true);
            }}
            className="btn-primary"
          >
            <Plus size={16} /> New vehicle
          </button>
        }
      />

      <div className="stagger mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat
          label="Vehicles"
          value={filtered.length}
          sub={unregistered ? `${unregistered} not yet added to fleet` : undefined}
          icon={<Truck size={16} />}
        />
        <Stat label="Trips" value={fleetTotals.trips} />
        <Stat label="Billed" value={`₹${inr(fleetTotals.billed)}`} tone="gold" />
        <Stat
          label="Net after costs"
          value={`₹${inr(fleetTotals.net)}`}
          tone={fleetTotals.net >= 0 ? "green" : "red"}
          sub={`₹${inr(fleetTotals.expenses)} spent`}
        />
      </div>

      <Card bodyClassName="p-0">
        <div className="border-b border-navy-100 p-4">
          <div className="relative max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search vehicles…"
              className="pl-9"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Truck size={32} />}
            title={rows.length ? "No matches" : "No vehicles yet"}
            message={
              rows.length
                ? "Try a different search."
                : "Vehicles appear here automatically once you record an entry, or add one now."
            }
            action={
              <button
                onClick={() => {
                  setDraft(blankVehicle());
                  setIsNew(true);
                }}
                className="btn-primary"
              >
                <Plus size={16} /> New vehicle
              </button>
            }
          />
        ) : (
          <Table
            head={
              <>
                <th className="th">Vehicle</th>
                <th className="th">Owner / type</th>
                <th className="th text-right">Trips</th>
                <th className="th text-right">Billed</th>
                <th className="th text-right">Trip costs</th>
                <th className="th text-right">Other costs</th>
                <th className="th text-right">Net</th>
                <th className="th"></th>
              </>
            }
          >
            {filtered.map((r) => {
              const net = r.totals.net - r.standing;
              return (
                <tr key={r.number} className="group transition hover:bg-navy-50/60">
                  <td className="td">
                    <Link
                      href={`/vehicles/${encodeURIComponent(r.number)}`}
                      className="font-mono text-xs font-bold text-navy-900 hover:underline"
                    >
                      {r.number}
                    </Link>
                    {!r.vehicle && (
                      <span className="ml-2">
                        <Chip tone="gold">Not in fleet</Chip>
                      </span>
                    )}
                    {r.vehicle && !r.vehicle.active && (
                      <span className="ml-2">
                        <Chip tone="slate">Inactive</Chip>
                      </span>
                    )}
                  </td>
                  <td className="td text-navy-600">
                    {r.vehicle?.ownerName || r.vehicle?.type ? (
                      <div className="leading-tight">
                        <div>{r.vehicle?.ownerName || "—"}</div>
                        {r.vehicle?.type && (
                          <div className="text-xs text-navy-400">{r.vehicle.type}</div>
                        )}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="td tabular text-right">{r.totals.trips}</td>
                  <td className="td tabular text-right font-semibold">₹{inr(r.totals.billed)}</td>
                  <td className="td tabular text-right text-red-600">
                    {r.totals.vehicleExp ? `₹${inr(r.totals.vehicleExp)}` : "—"}
                  </td>
                  <td className="td tabular text-right text-red-600">
                    {r.standing ? `₹${inr(r.standing)}` : "—"}
                  </td>
                  <td
                    className={cx(
                      "td tabular text-right font-bold",
                      net >= 0 ? "text-emerald-700" : "text-red-600"
                    )}
                  >
                    ₹{inr(net)}
                  </td>
                  <td className="td">
                    <div className="flex items-center justify-end gap-1">
                      {!r.vehicle && (
                        <button
                          onClick={() => {
                            setDraft(blankVehicle(r.number));
                            setIsNew(true);
                          }}
                          className="rounded-lg p-1.5 text-navy-500 opacity-0 transition hover:bg-navy-100 group-hover:opacity-100"
                          title="Add to fleet"
                        >
                          <Plus size={15} />
                        </button>
                      )}
                      {r.vehicle && (
                        <button
                          onClick={() => {
                            setDraft(r.vehicle!);
                            setIsNew(false);
                          }}
                          className="rounded-lg p-1.5 text-navy-500 opacity-0 transition hover:bg-navy-100 group-hover:opacity-100"
                          title="Edit"
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                      <Link
                        href={`/vehicles/${encodeURIComponent(r.number)}`}
                        className="inline-flex rounded-lg p-1.5 text-navy-400 hover:bg-navy-100 hover:text-navy-700"
                      >
                        <ChevronRight size={16} />
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <VehicleModal
        draft={draft}
        isNew={isNew}
        knownNumbers={vehicleNumbers}
        onClose={() => setDraft(null)}
        onSave={async (v) => {
          await store.saveVehicle(v);
          setDraft(null);
        }}
      />
    </>
  );
}

