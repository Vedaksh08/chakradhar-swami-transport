"use client";

import { useState } from "react";
import type { Vehicle } from "@/lib/types";
import { uid } from "@/lib/calc";
import { Field, Input, Modal, Textarea, cx } from "./ui";

export function blankVehicle(number = ""): Vehicle {
  return {
    id: uid(),
    number,
    active: true,
    expenses: [],
    createdAt: new Date().toISOString(),
  };
}

export function VehicleModal({
  draft,
  isNew,
  knownNumbers,
  onClose,
  onSave,
}: {
  draft: Vehicle | null;
  isNew: boolean;
  knownNumbers: string[];
  onClose: () => void;
  onSave: (v: Vehicle) => Promise<void>;
}) {
  const [value, setValue] = useState<Vehicle | null>(draft);

  // Re-seed when a different vehicle is opened.
  const [seed, setSeed] = useState(draft?.id);
  if (draft?.id !== seed) {
    setSeed(draft?.id);
    setValue(draft);
  }

  if (!draft || !value) return null;

  const set = <K extends keyof Vehicle>(k: K, v: Vehicle[K]) => setValue({ ...value, [k]: v });

  const number = value.number.trim().toUpperCase();
  const duplicate =
    isNew && knownNumbers.includes(number) && draft.number.toUpperCase() !== number;
  const valid = Boolean(number) && !duplicate;

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? "New vehicle" : `Edit ${draft.number}`}
      subtitle="Registration is all that's required."
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={!valid} onClick={() => onSave(value)}>
            Save vehicle
          </button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Registration no."
            required
            hint={duplicate ? "That registration already exists" : undefined}
          >
            <Input
              value={value.number}
              onChange={(e) => set("number", e.target.value.toUpperCase())}
              placeholder="MH12NX9008"
              className={cx("font-mono uppercase", duplicate && "border-red-400 bg-red-50")}
            />
          </Field>
          <Field label="Type">
            <Input
              value={value.type ?? ""}
              onChange={(e) => set("type", e.target.value)}
              placeholder="Trailer / Tipper / 6-wheeler"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Owner" className="sm:col-span-2">
            <Input
              value={value.ownerName ?? ""}
              onChange={(e) => set("ownerName", e.target.value)}
            />
          </Field>
          <Field label="Capacity (MT)">
            <Input
              type="number"
              step="0.001"
              value={value.capacityMt ?? ""}
              onChange={(e) =>
                set("capacityMt", e.target.value === "" ? undefined : Number(e.target.value))
              }
            />
          </Field>
        </div>

        <div className="rounded-xl border border-navy-200 p-4">
          <h3 className="mb-3 text-sm font-bold text-navy-900">Renewals</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Insurance">
              <Input
                type="date"
                value={value.insuranceExpiry ?? ""}
                onChange={(e) => set("insuranceExpiry", e.target.value)}
              />
            </Field>
            <Field label="Fitness">
              <Input
                type="date"
                value={value.fitnessExpiry ?? ""}
                onChange={(e) => set("fitnessExpiry", e.target.value)}
              />
            </Field>
            <Field label="Permit">
              <Input
                type="date"
                value={value.permitExpiry ?? ""}
                onChange={(e) => set("permitExpiry", e.target.value)}
              />
            </Field>
            <Field label="PUC">
              <Input
                type="date"
                value={value.pucExpiry ?? ""}
                onChange={(e) => set("pucExpiry", e.target.value)}
              />
            </Field>
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
            <Textarea
              rows={2}
              value={value.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
