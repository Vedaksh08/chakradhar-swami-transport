"use client";

import { useRef, useState } from "react";
import { Database, HardDrive, Download, Upload, AlertTriangle, Check } from "lucide-react";
import type { CompanyProfile, DB } from "@/lib/types";
import { useStore } from "@/lib/store";
import { normaliseEntry } from "@/lib/repo";
import { Card, Field, ImagePicker, Input, Modal, PageHeader, Textarea } from "@/components/ui";

export default function SettingsPage() {
  const store = useStore();
  const [company, setCompany] = useState<CompanyProfile>(store.company);
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof CompanyProfile>(k: K, v: CompanyProfile[K]) =>
    setCompany((p) => ({ ...p, [k]: v }));

  async function save() {
    await store.saveCompany(company);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function backup() {
    const blob = new Blob([JSON.stringify(store.db, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cst-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function restore(file?: File) {
    if (!file) return;
    setImportError(null);
    try {
      const parsed = JSON.parse(await file.text()) as Partial<DB>;
      if (!Array.isArray(parsed.entries) || !Array.isArray(parsed.parties)) {
        throw new Error("This file doesn't look like a backup.");
      }
      await store.importDB({
        parties: parsed.parties ?? [],
        drivers: parsed.drivers ?? [],
        vehicles: parsed.vehicles ?? [],
        entries: (parsed.entries ?? []).map(normaliseEntry),
        invoices: parsed.invoices ?? [],
        company: { ...store.company, ...(parsed.company ?? {}) },
      });
      setCompany({ ...store.company, ...(parsed.company ?? {}) });
    } catch (e: any) {
      setImportError(e?.message ?? String(e));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Your company details, backups and storage."
        actions={
          <button onClick={save} className="btn-primary">
            {saved ? (
              <>
                <Check size={16} /> Saved
              </>
            ) : (
              "Save changes"
            )}
          </button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Company details"
          subtitle="Printed at the top of every invoice."
        >
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="Prefix" hint="Devanagari header">
                <Input value={company.shree} onChange={(e) => set("shree", e.target.value)} />
              </Field>
              <Field label="Company name" required className="sm:col-span-3">
                <Input value={company.name} onChange={(e) => set("name", e.target.value)} />
              </Field>
            </div>

            <Field label="Address">
              <Textarea
                rows={2}
                value={company.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email">
                <Input value={company.email} onChange={(e) => set("email", e.target.value)} />
              </Field>
              <Field label="Mobile">
                <Input value={company.phone} onChange={(e) => set("phone", e.target.value)} />
              </Field>
              <Field label="PAN">
                <Input
                  value={company.pan}
                  onChange={(e) => set("pan", e.target.value.toUpperCase())}
                  className="font-mono uppercase"
                />
              </Field>
              <Field
                label="Invoice prefix"
                hint={`${company.invoicePrefix || "CST"}/MTC/01/26-27`}
              >
                <Input
                  value={company.invoicePrefix ?? ""}
                  onChange={(e) => set("invoicePrefix", e.target.value.toUpperCase())}
                  placeholder="CST"
                  className="font-mono uppercase"
                  maxLength={10}
                />
              </Field>
              <Field label="GSTIN" hint="Optional">
                <Input
                  value={company.gstin ?? ""}
                  onChange={(e) => set("gstin", e.target.value.toUpperCase())}
                  className="font-mono uppercase"
                />
              </Field>
            </div>

            <div className="max-w-[200px]">
              <ImagePicker
                label="Logo"
                value={company.logo}
                onChange={(v) => set("logo", v)}
                aspect="aspect-square"
              />
            </div>
          </div>
        </Card>

        <div className="grid content-start gap-5">
          <Card title="Storage">
            <div className="flex items-start gap-3 rounded-lg border border-navy-200 bg-navy-50/60 p-3">
              {store.backend === "supabase" ? (
                <Database size={18} className="mt-0.5 shrink-0 text-emerald-600" />
              ) : (
                <HardDrive size={18} className="mt-0.5 shrink-0 text-gold-600" />
              )}
              <div>
                <p className="text-sm font-bold text-navy-900">
                  {store.backend === "supabase" ? "Supabase connected" : "Local browser storage"}
                </p>
                <p className="mt-0.5 text-xs text-navy-500">
                  {store.backend === "supabase"
                    ? "Data is saved to your Supabase project."
                    : "Data lives in this browser only. Add Supabase keys to .env.local to move it to the cloud."}
                </p>
              </div>
            </div>

            {store.backend === "local" && (
              <div className="mt-3 rounded-lg bg-navy-900 p-3">
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-navy-300">
                  To connect Supabase
                </p>
                <pre className="overflow-x-auto text-[11px] leading-relaxed text-gold-300">
{`NEXT_PUBLIC_SUPABASE_URL=…
NEXT_PUBLIC_SUPABASE_ANON_KEY=…`}
                </pre>
                <p className="mt-2 text-[11px] text-navy-400">
                  Put these in <code className="text-navy-200">.env.local</code>, run{" "}
                  <code className="text-navy-200">supabase/schema.sql</code>, then restart.
                </p>
              </div>
            )}
          </Card>

          <Card title="Backup" subtitle="Keep a copy of everything.">
            <div className="grid gap-2">
              <button onClick={backup} className="btn-ghost w-full">
                <Download size={16} /> Download backup
              </button>
              <button onClick={() => fileRef.current?.click()} className="btn-ghost w-full">
                <Upload size={16} /> Restore from file
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => restore(e.target.files?.[0])}
              />
              {importError && <p className="text-xs font-semibold text-red-600">{importError}</p>}
            </div>
          </Card>

          <Card title="Danger zone">
            <button onClick={() => setConfirmReset(true)} className="btn-danger w-full">
              <AlertTriangle size={16} /> Clear all data
            </button>
          </Card>
        </div>
      </div>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Clear all data?"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
            <button
              className="btn-danger"
              onClick={async () => {
                await store.resetAll();
                setConfirmReset(false);
              }}
            >
              Yes, clear everything
            </button>
          </>
        }
      >
        <p className="text-sm text-navy-600">
          All {store.entries.length} entries, {store.invoices.length} invoices,{" "}
          {store.parties.length} parties and {store.drivers.length} drivers will be deleted. Your
          company details are kept.
        </p>
        <p className="mt-3 rounded-lg bg-gold-50 px-3 py-2 text-sm text-gold-900">
          Download a backup first — this cannot be undone.
        </p>
      </Modal>
    </>
  );
}
