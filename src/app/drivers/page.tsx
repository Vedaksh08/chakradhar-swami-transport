"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Users, Plus, Search, ChevronRight, IdCard } from "lucide-react";
import type { Driver } from "@/lib/types";
import { useStore } from "@/lib/store";
import { entryExpenses, inr, startOfMonth, today } from "@/lib/calc";
import { Card, Chip, EmptyState, Input, Modal, PageHeader, Stat, Table } from "@/components/ui";
import { DriverForm, blankDriver } from "@/components/DriverForm";

export default function DriversPage() {
  const store = useStore();
  const { drivers, entries } = store;

  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Driver | null>(null);

  const monthStart = startOfMonth();
  const monthEnd = today();

  const stats = useMemo(() => {
    const m = new Map<string, { trips: number; exp: number; monthExp: number }>();
    for (const e of entries) {
      if (!e.driverId) continue;
      const s = m.get(e.driverId) ?? { trips: 0, exp: 0, monthExp: 0 };
      s.trips += 1;
      const ex = entryExpenses(e);
      s.exp += ex;
      if (e.date >= monthStart && e.date <= monthEnd) s.monthExp += ex;
      m.set(e.driverId, s);
    }
    return m;
  }, [entries, monthStart, monthEnd]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return drivers
      .filter((d) =>
        !n ? true : [d.name, d.phone, d.licenceNo, d.panNo].join(" ").toLowerCase().includes(n)
      )
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  }, [drivers, q]);

  const monthTotal = useMemo(
    () => [...stats.values()].reduce((s, x) => s + x.monthExp, 0),
    [stats]
  );

  const valid = Boolean(draft?.name.trim());

  return (
    <>
      <PageHeader
        title="Drivers"
        subtitle="Documents, trips and expenses for every driver."
        actions={
          <button onClick={() => setDraft(blankDriver())} className="btn-primary">
            <Plus size={16} /> New driver
          </button>
        }
      />

      <div className="stagger mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <Stat
          label="Drivers"
          value={drivers.length}
          sub={`${drivers.filter((d) => d.active).length} active`}
        />
        <Stat label="Trips recorded" value={entries.filter((e) => e.driverId).length} />
        <Stat label="Expenses this month" value={`₹${inr(monthTotal)}`} tone="red" />
      </div>

      <Card bodyClassName="p-0">
        <div className="border-b border-navy-100 p-4">
          <div className="relative max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search drivers…"
              className="pl-9"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Users size={32} />}
            title={drivers.length ? "No matches" : "No drivers yet"}
            message={
              drivers.length
                ? "Try a different search."
                : "Add your drivers so you can attach them to entries."
            }
            action={
              <button onClick={() => setDraft(blankDriver())} className="btn-primary">
                <Plus size={16} /> New driver
              </button>
            }
          />
        ) : (
          <Table
            head={
              <>
                <th className="th">Driver</th>
                <th className="th">Phone</th>
                <th className="th">Documents</th>
                <th className="th text-right">Trips</th>
                <th className="th text-right">Expenses (month)</th>
                <th className="th text-right">Expenses (all)</th>
                <th className="th"></th>
              </>
            }
          >
            {filtered.map((d) => {
              const s = stats.get(d.id) ?? { trips: 0, exp: 0, monthExp: 0 };
              const docCount = [
                d.docs?.pan,
                d.docs?.aadhaar,
                d.docs?.licence,
                d.docs?.police,
              ].filter(Boolean).length;
              return (
                <tr key={d.id} className="transition hover:bg-navy-50/60">
                  <td className="td">
                    <Link href={`/drivers/${d.id}`} className="flex items-center gap-3">
                      {d.docs?.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={d.docs.photo}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-navy-100 text-xs font-bold text-navy-600">
                          {d.name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <span>
                        <span className="block font-bold text-navy-900 hover:underline">
                          {d.name}
                        </span>
                        {!d.active && <Chip tone="slate">Inactive</Chip>}
                      </span>
                    </Link>
                  </td>
                  <td className="td">{d.phone || "—"}</td>
                  <td className="td">
                    <span className="inline-flex items-center gap-1.5 text-xs text-navy-500">
                      <IdCard size={14} />
                      {docCount}/4
                    </span>
                  </td>
                  <td className="td tabular text-right">{s.trips}</td>
                  <td className="td tabular text-right font-semibold text-red-600">
                    {s.monthExp ? `₹${inr(s.monthExp)}` : "—"}
                  </td>
                  <td className="td tabular text-right">{s.exp ? `₹${inr(s.exp)}` : "—"}</td>
                  <td className="td text-right">
                    <Link
                      href={`/drivers/${d.id}`}
                      className="inline-flex rounded-lg p-1.5 text-navy-400 hover:bg-navy-100 hover:text-navy-700"
                    >
                      <ChevronRight size={16} />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title="New driver"
        subtitle="Only the name is required."
        wide
        footer={
          <>
            <button className="btn-ghost" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              disabled={!valid}
              onClick={async () => {
                if (!draft) return;
                await store.saveDriver({ ...draft, name: draft.name.trim() });
                setDraft(null);
              }}
            >
              Save driver
            </button>
          </>
        }
      >
        {draft && <DriverForm value={draft} onChange={setDraft} />}
      </Modal>
    </>
  );
}
