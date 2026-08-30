"use client";

import type { Driver } from "@/lib/types";
import { uid } from "@/lib/calc";
import { Field, ImagePicker, Input, Textarea } from "./ui";

export function blankDriver(): Driver {
  return { id: uid(), name: "", active: true, docs: {}, createdAt: new Date().toISOString() };
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
