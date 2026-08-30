"use client";

import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ExpenseLine } from "@/lib/types";
import { inr, num, uid } from "@/lib/calc";
import { Input } from "./ui";

/** A titled block of label+amount rows with quick-add chips and a total. */
export function ExpenseLines({
  title,
  hint,
  quick,
  value,
  onChange,
  tone = "navy",
}: {
  title: string;
  hint: string;
  quick: string[];
  value: ExpenseLine[];
  onChange: (lines: ExpenseLine[]) => void;
  tone?: "navy" | "gold";
}) {
  const lines = value ?? [];
  const total = lines.reduce((s, x) => s + num(x.amount), 0);

  const used = useMemo(
    () => new Set(lines.map((x) => x.label.trim().toLowerCase())),
    [lines]
  );

  const add = (label = "") => onChange([...lines, { id: uid(), label, amount: 0 }]);
  const patch = (id: string, p: Partial<ExpenseLine>) =>
    onChange(lines.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const remove = (id: string) => onChange(lines.filter((x) => x.id !== id));

  return (
    <div className="rounded-xl border border-navy-200 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-navy-900">{title}</h3>
          <p className="text-xs text-navy-500">{hint}</p>
        </div>
        <button type="button" onClick={() => add()} className="btn-ghost btn-sm">
          <Plus size={14} /> Add
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {quick
          .filter((q) => !used.has(q.toLowerCase()))
          .map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => add(q)}
              className="inline-flex items-center gap-1 rounded-full border border-navy-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-navy-600 transition hover:border-navy-400 hover:bg-navy-50"
            >
              <Plus size={12} /> {q}
            </button>
          ))}
      </div>

      {lines.length === 0 ? (
        <p className="rounded-lg border border-dashed border-navy-200 py-4 text-center text-xs text-navy-400">
          Nothing recorded.
        </p>
      ) : (
        <div className="grid gap-2">
          {lines.map((x) => (
            <div key={x.id} className="flex items-center gap-2">
              <Input
                value={x.label}
                onChange={(e) => patch(x.id, { label: e.target.value })}
                placeholder="Expense name"
                className="min-w-0 flex-1"
              />
              <Input
                type="number"
                step="0.01"
                value={x.amount || ""}
                onChange={(e) => patch(x.id, { amount: num(e.target.value) })}
                placeholder="0.00"
                className="w-28 shrink-0"
              />
              <button
                type="button"
                onClick={() => remove(x.id)}
                className="shrink-0 rounded-lg p-2 text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                aria-label="Remove"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-navy-100 pt-2 text-sm">
            <span className="font-semibold text-navy-600">Total</span>
            <span
              className={
                tone === "gold"
                  ? "tabular font-bold text-gold-700"
                  : "tabular font-bold text-navy-900"
              }
            >
              ₹{inr(total)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
