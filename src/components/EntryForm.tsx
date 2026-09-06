"use client";

import { useEffect, useState } from "react";
import type { Entry } from "@/lib/types";
import {
  autoAmount,
  entryDriverExpenses,
  entryNet,
  entryTotal,
  entryVehicleExpenses,
  inr,
  num,
  roundRupees,
  today,
  uid,
} from "@/lib/calc";
import { useStore } from "@/lib/store";
import { Field, Input, Select, Textarea, cx } from "./ui";
import { ExpenseLines } from "./ExpenseLines";
import { PhotoLines } from "./PhotoLines";

const QUICK_VEHICLE = ["Diesel", "Toll", "Parking", "Repair"];
const QUICK_DRIVER = ["Batta", "Food", "Advance", "Other"];

export function blankEntry(invoiceNo: string): Entry {
  return {
    id: uid(),
    direction: "outward",
    invoiceNo,
    date: today(),
    partyId: "",
    qty: 0,
    rate: 0,
    amount: 0,
    detention: undefined,
    vehicleNo: "",
    driverId: "",
    driverExpenses: [],
    vehicleExpenses: [],
    photos: [],
    createdAt: new Date().toISOString(),
  };
}

export function EntryForm({
  value,
  onChange,
}: {
  value: Entry;
  onChange: (e: Entry) => void;
}) {
  const { parties, drivers, vehicleNumbers, consignees } = useStore();
  const set = <K extends keyof Entry>(k: K, v: Entry[K]) => onChange({ ...value, [k]: v });

  // Amount auto-fills from qty x rate, but stops overwriting once it's been
  // hand-edited — real trips are often billed at a flat rate.
  const [amountTouched, setAmountTouched] = useState(
    () => value.amount > 0 && value.amount !== autoAmount(value.qty, value.rate)
  );

  useEffect(() => {
    if (amountTouched) return;
    const next = autoAmount(value.qty, value.rate);
    if (next !== value.amount) onChange({ ...value, amount: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.qty, value.rate, amountTouched]);

  const suggested = autoAmount(value.qty, value.rate);
  const total = entryTotal(value);
  const driverExp = entryDriverExpenses(value);
  const vehicleExp = entryVehicleExpenses(value);
  const net = entryNet(value);

  return (
    <div className="grid gap-5">
      {/* Direction */}
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-navy-50 p-1">
        {(["outward", "inward"] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => set("direction", d)}
            className={cx(
              "rounded-lg px-3 py-2 text-sm font-bold capitalize transition",
              value.direction === d
                ? "bg-navy-800 text-white shadow-sm"
                : "text-navy-600 hover:bg-white"
            )}
          >
            {d === "outward" ? "Outward — we send" : "Inward — they send"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Invoice / LR No." required>
          <Input
            value={value.invoiceNo}
            onChange={(e) => set("invoiceNo", e.target.value)}
            placeholder="e.g. 101"
          />
        </Field>
        <Field label="Date" required>
          <Input type="date" value={value.date} onChange={(e) => set("date", e.target.value)} />
        </Field>
        <Field label="Vehicle No." required>
          <Input
            list="vehicle-numbers"
            value={value.vehicleNo}
            onChange={(e) => set("vehicleNo", e.target.value.toUpperCase())}
            placeholder="MH12NX9008"
            className="uppercase"
          />
          <datalist id="vehicle-numbers">
            {vehicleNumbers.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company / Party" required>
          <Select value={value.partyId} onChange={(e) => set("partyId", e.target.value)}>
            <option value="">Select party…</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Driver">
          <Select value={value.driverId ?? ""} onChange={(e) => set("driverId", e.target.value)}>
            <option value="">Select driver…</option>
            {drivers
              .filter((d) => d.active || d.id === value.driverId)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </Select>
        </Field>
      </div>

      <Field
        label="Delivered to"
        hint="Shows in the NAME column on the entry report. Leave blank to use the party name."
      >
        <Input
          list="consignee-names"
          value={value.consignee ?? ""}
          onChange={(e) => set("consignee", e.target.value.toUpperCase())}
          placeholder="WHEELS INDIA LTD"
          className="uppercase"
        />
        <datalist id="consignee-names">
          {consignees.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>

      {/* Money */}
      <div className="rounded-xl border border-navy-200 bg-navy-50/50 p-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Quantity">
            <Input
              type="number"
              step="0.001"
              value={value.qty || ""}
              onChange={(e) => set("qty", num(e.target.value))}
              placeholder="0.000"
            />
          </Field>
          <Field label="Rate">
            <Input
              type="number"
              step="0.01"
              value={value.rate || ""}
              onChange={(e) => set("rate", num(e.target.value))}
              placeholder="0.00"
            />
          </Field>
          <Field
            label="Amount"
            hint={
              amountTouched && suggested !== value.amount
                ? `Edited — qty × rate = ${inr(suggested)}`
                : "Auto: qty × rate, to the nearest rupee"
            }
          >
            <div className="flex gap-1.5">
              <Input
                type="number"
                step="1"
                value={value.amount || ""}
                onChange={(e) => {
                  setAmountTouched(true);
                  set("amount", num(e.target.value));
                }}
                // Rounded when the field is left rather than as it's typed,
                // so "1234.5" can still be typed out in full.
                onBlur={(e) => set("amount", roundRupees(e.target.value))}
                className={cx("font-semibold", amountTouched && "border-gold-400 bg-gold-50")}
              />
              {amountTouched && (
                <button
                  type="button"
                  title="Reset to qty × rate"
                  onClick={() => {
                    setAmountTouched(false);
                    set("amount", suggested);
                  }}
                  className="btn-ghost btn-sm shrink-0"
                >
                  Auto
                </button>
              )}
            </div>
          </Field>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Detention" hint="Optional — adds to the total">
            <Input
              type="number"
              step="0.01"
              value={value.detention ?? ""}
              onChange={(e) =>
                set("detention", e.target.value === "" ? undefined : num(e.target.value))
              }
              placeholder="0.00"
            />
          </Field>
          <Field label="Detention remark" className="sm:col-span-2">
            <Input
              value={value.detentionRemark ?? ""}
              onChange={(e) => set("detentionRemark", e.target.value)}
              placeholder="Why detention was charged"
            />
          </Field>
        </div>

        {/* Running result for this trip */}
        <dl className="mt-4 overflow-hidden rounded-lg bg-navy-800 text-white">
          <div className="flex items-center justify-between px-4 py-2.5">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-navy-200">
              Billed {num(value.detention) ? "(incl. detention)" : ""}
            </dt>
            <dd className="tabular font-bold">₹{inr(total)}</dd>
          </div>
          <div className="flex items-center justify-between border-t border-white/10 px-4 py-2">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-navy-300">
              − Vehicle expenses
            </dt>
            <dd className="tabular text-sm text-red-300">₹{inr(vehicleExp)}</dd>
          </div>
          <div className="flex items-center justify-between border-t border-white/10 px-4 py-2">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-navy-300">
              − Driver expenses
            </dt>
            <dd className="tabular text-sm text-red-300">₹{inr(driverExp)}</dd>
          </div>
          <div className="flex items-center justify-between border-t-2 border-gold-500 bg-navy-900 px-4 py-3">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-navy-200">
              Net on this trip
            </dt>
            <dd
              className={cx(
                "tabular text-xl font-extrabold",
                net >= 0 ? "text-gold-400" : "text-red-400"
              )}
            >
              ₹{inr(net)}
            </dd>
          </div>
        </dl>
      </div>

      <ExpenseLines
        title="Vehicle expenses"
        hint="What the vehicle cost on this trip — diesel, toll, running repairs."
        quick={QUICK_VEHICLE}
        value={value.vehicleExpenses}
        onChange={(lines) => set("vehicleExpenses", lines)}
      />

      <ExpenseLines
        title="Driver expenses"
        hint="What the driver spent — batta, food, road advance."
        quick={QUICK_DRIVER}
        value={value.driverExpenses}
        onChange={(lines) => set("driverExpenses", lines)}
        tone="gold"
      />

      <PhotoLines value={value.photos} onChange={(photos) => set("photos", photos)} />

      <Field label="Remarks">
        <Textarea
          rows={3}
          value={value.remarks ?? ""}
          onChange={(e) => set("remarks", e.target.value)}
          placeholder="Anything worth noting about this trip"
        />
      </Field>
    </div>
  );
}
