"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Fuel } from "lucide-react";
import type { Entry, ExpenseLine } from "@/lib/types";
import { autoAmount, entryExpenses, entryTotal, inr, num, today, uid } from "@/lib/calc";
import { useStore } from "@/lib/store";
import { Field, ImagePicker, Input, Select, Textarea, cx } from "./ui";

const QUICK_EXPENSES = ["Diesel", "Toll", "Driver Exp", "Other"];

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
    expenses: [],
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
  const expTotal = entryExpenses(value);

  const addExpense = (label = "") =>
    set("expenses", [...(value.expenses ?? []), { id: uid(), label, amount: 0 }]);

  const patchExpense = (id: string, patch: Partial<ExpenseLine>) =>
    set(
      "expenses",
      (value.expenses ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x))
    );

  const removeExpense = (id: string) =>
    set("expenses", (value.expenses ?? []).filter((x) => x.id !== id));

  const usedLabels = useMemo(
    () => new Set((value.expenses ?? []).map((x) => x.label.toLowerCase())),
    [value.expenses]
  );

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
                : "Auto: qty × rate"
            }
          >
            <div className="flex gap-1.5">
              <Input
                type="number"
                step="0.01"
                value={value.amount || ""}
                onChange={(e) => {
                  setAmountTouched(true);
                  set("amount", num(e.target.value));
                }}
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

        <div className="mt-4 flex items-center justify-between rounded-lg bg-navy-800 px-4 py-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-navy-200">
            Entry total {num(value.detention) ? "(incl. detention)" : ""}
          </span>
          <span className="tabular text-xl font-extrabold text-gold-400">₹{inr(total)}</span>
        </div>
      </div>

      {/* Driver expenses */}
      <div className="rounded-xl border border-navy-200 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-navy-900">Expenses by driver</h3>
            <p className="text-xs text-navy-500">Tracked against the driver — never billed to the party.</p>
          </div>
          <button type="button" onClick={() => addExpense()} className="btn-ghost btn-sm">
            <Plus size={14} /> Add
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {QUICK_EXPENSES.filter((q) => !usedLabels.has(q.toLowerCase())).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => addExpense(q)}
              className="inline-flex items-center gap-1 rounded-full border border-navy-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-navy-600 transition hover:border-navy-400 hover:bg-navy-50"
            >
              {q === "Diesel" ? <Fuel size={12} /> : <Plus size={12} />} {q}
            </button>
          ))}
        </div>

        {(value.expenses ?? []).length === 0 ? (
          <p className="rounded-lg border border-dashed border-navy-200 py-4 text-center text-xs text-navy-400">
            No expenses recorded for this trip.
          </p>
        ) : (
          <div className="grid gap-2">
            {value.expenses.map((x) => (
              <div key={x.id} className="flex items-center gap-2">
                <Input
                  value={x.label}
                  onChange={(e) => patchExpense(x.id, { label: e.target.value })}
                  placeholder="Expense name"
                  className="flex-1"
                />
                <Input
                  type="number"
                  step="0.01"
                  value={x.amount || ""}
                  onChange={(e) => patchExpense(x.id, { amount: num(e.target.value) })}
                  placeholder="0.00"
                  className="w-32"
                />
                <button
                  type="button"
                  onClick={() => removeExpense(x.id)}
                  className="rounded-lg p-2 text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                  aria-label="Remove expense"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-navy-100 pt-2 text-sm">
              <span className="font-semibold text-navy-600">Total expenses</span>
              <span className="tabular font-bold text-navy-900">₹{inr(expTotal)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ImagePicker
          label="Acknowledgment photo"
          value={value.ackPhoto}
          onChange={(v) => set("ackPhoto", v)}
        />
        <Field label="Remarks">
          <Textarea
            rows={5}
            value={value.remarks ?? ""}
            onChange={(e) => set("remarks", e.target.value)}
            placeholder="Anything worth noting about this trip"
          />
        </Field>
      </div>
    </div>
  );
}
