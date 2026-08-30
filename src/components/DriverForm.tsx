"use client";

import { Plus, Trash2 } from "lucide-react";
import type { AdvanceLine, Driver } from "@/lib/types";
import { inr, num, today, uid } from "@/lib/calc";
import { Field, ImagePicker, Input, Textarea } from "./ui";

export function blankDriver(): Driver {
  return {
    id: uid(),
    name: "",
    active: true,
    docs: {},
    advances: [],
    createdAt: new Date().toISOString(),
  };
}

export function DriverForm({
  value,
  onChange,
}: {
  value: Driver;
  onChange: (d: Driver) => void;
}) {
  const set = <K extends keyof Driver>(k: K, v: Driver[K]) => onChange({ ...value, [k]: v });
  const setDoc = (k: keyof NonNullable<Driver["docs"]>, v?: string) =>
    onChange({ ...value, docs: { ...(value.docs ?? {}), [k]: v } });

  const advances = value.advances ?? [];
  const advanceTotal = advances.reduce((s, a) => s + num(a.amount), 0);

  const addAdvance = () =>
    set("advances", [...advances, { id: uid(), date: today(), amount: 0 } as AdvanceLine]);

  const patchAdvance = (id: string, patch: Partial<AdvanceLine>) =>
    set(
      "advances",
      advances.map((a) => (a.id === id ? { ...a, ...patch } : a))
    );

  const removeAdvance = (id: string) =>
    set(
      "advances",
      advances.filter((a) => a.id !== id)
    );

  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Driver name" required className="sm:col-span-2">
          <Input
            value={value.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="RAJESH KUSALKAR"
          />
        </Field>
        <Field label="Phone">
          <Input value={value.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
        </Field>
      </div>

      <Field label="Address">
        <Textarea
          rows={2}
          value={value.address ?? ""}
          onChange={(e) => set("address", e.target.value)}
        />
      </Field>

      {/* Pay and advances — these drive the monthly settlement. */}
      <div className="rounded-xl border border-navy-200 p-4">
        <h3 className="text-sm font-bold text-navy-900">Pay &amp; advances</h3>
        <p className="mb-4 text-xs text-navy-500">
          Used to work out what you owe the driver, or he owes you, each month.
        </p>

        <Field label="Monthly pay" hint="Agreed salary per month" className="sm:max-w-xs">
          <Input
            type="number"
            step="0.01"
            value={value.monthlyPay ?? ""}
            onChange={(e) =>
              set("monthlyPay", e.target.value === "" ? undefined : num(e.target.value))
            }
            placeholder="0.00"
          />
        </Field>

        <div className="mt-5 mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-bold text-navy-900">Advances taken</h4>
            <p className="text-xs text-navy-500">
              Cash given up front. Dated, so each month settles on its own.
            </p>
          </div>
          <button type="button" onClick={addAdvance} className="btn-ghost btn-sm">
            <Plus size={14} /> Add advance
          </button>
        </div>

        {advances.length === 0 ? (
          <p className="rounded-lg border border-dashed border-navy-200 py-4 text-center text-xs text-navy-400">
            No advances recorded.
          </p>
        ) : (
          <div className="grid gap-2">
            {advances.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2">
                <Input
                  type="date"
                  value={a.date}
                  onChange={(e) => patchAdvance(a.id, { date: e.target.value })}
                  className="w-full sm:w-40"
                />
                <Input
                  type="number"
                  step="0.01"
                  value={a.amount || ""}
                  onChange={(e) => patchAdvance(a.id, { amount: num(e.target.value) })}
                  placeholder="0.00"
                  className="w-28"
                />
                <Input
                  value={a.note ?? ""}
                  onChange={(e) => patchAdvance(a.id, { note: e.target.value })}
                  placeholder="Note (optional)"
                  className="min-w-0 flex-1"
                />
                <button
                  type="button"
                  onClick={() => removeAdvance(a.id)}
                  className="rounded-lg p-2 text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                  aria-label="Remove advance"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-navy-100 pt-2 text-sm">
              <span className="font-semibold text-navy-600">Total advances</span>
              <span className="tabular font-bold text-navy-900">₹{inr(advanceTotal)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-navy-200 p-4">
        <h3 className="mb-3 text-sm font-bold text-navy-900">Documents</h3>
        <p className="mb-4 text-xs text-navy-500">All optional — fill in whatever you have.</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Licence no.">
            <Input
              value={value.licenceNo ?? ""}
              onChange={(e) => set("licenceNo", e.target.value.toUpperCase())}
              className="font-mono uppercase"
            />
          </Field>
          <Field label="PAN no.">
            <Input
              value={value.panNo ?? ""}
              onChange={(e) => set("panNo", e.target.value.toUpperCase())}
              placeholder="ABCDE1234F"
              className="font-mono uppercase"
            />
          </Field>
          <Field label="Aadhaar no.">
            <Input
              value={value.aadhaarNo ?? ""}
              onChange={(e) => set("aadhaarNo", e.target.value)}
              placeholder="0000 0000 0000"
              className="font-mono"
            />
          </Field>
          <Field label="Police verification">
            <Input
              value={value.policeVerification ?? ""}
              onChange={(e) => set("policeVerification", e.target.value)}
              placeholder="Reference no. / status"
            />
          </Field>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <ImagePicker
            label="Photo"
            value={value.docs?.photo}
            onChange={(v) => setDoc("photo", v)}
            aspect="aspect-square"
          />
          <ImagePicker label="PAN copy" value={value.docs?.pan} onChange={(v) => setDoc("pan", v)} />
          <ImagePicker
            label="Aadhaar copy"
            value={value.docs?.aadhaar}
            onChange={(v) => setDoc("aadhaar", v)}
          />
          <ImagePicker
            label="Licence copy"
            value={value.docs?.licence}
            onChange={(v) => setDoc("licence", v)}
          />
          <ImagePicker
            label="Police verification"
            value={value.docs?.police}
            onChange={(v) => setDoc("police", v)}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Status">
          <label className="flex h-[38px] cursor-pointer items-center gap-2 rounded-lg border border-navy-200 bg-white px-3">
            <input
              type="checkbox"
              checked={value.active}
              onChange={(e) => set("active", e.target.checked)}
              className="h-4 w-4 rounded border-navy-300 text-navy-800 focus:ring-navy-500"
            />
            <span className="text-sm font-semibold text-navy-700">Active</span>
          </label>
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Input value={value.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>
    </div>
  );
}
