"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Landmark, Plus, Pencil, Trash2, Search, FileText } from "lucide-react";
import type { Company } from "@/lib/types";
import { useStore } from "@/lib/store";
import { entryTotal, inr, today, uid } from "@/lib/calc";
import {
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Stat,
  Table,
  Textarea,
} from "@/components/ui";

function blankCompany(): Company {
  return { id: uid(), name: "", createdAt: new Date().toISOString() };
}

export default function CompaniesPage() {
  const store = useStore();
  const { companies, parties, entries, invoices } = store;

  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Company | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Company | null>(null);

  /** Member parties, trip count and billed value per company. */
  const stats = useMemo(() => {
    const membersByCompany = new Map<string, Set<string>>();
    for (const p of parties) {
      if (!p.companyId) continue;
      if (!membersByCompany.has(p.companyId)) membersByCompany.set(p.companyId, new Set());
      membersByCompany.get(p.companyId)!.add(p.id);
    }

    const m = new Map<
      string,
      { members: number; trips: number; total: number; unbilled: number; invoices: number }
    >();
    for (const c of companies) {
      const memberIds = membersByCompany.get(c.id) ?? new Set<string>();
      let trips = 0;
      let total = 0;
      let unbilled = 0;
      for (const e of entries) {
        if (!memberIds.has(e.partyId)) continue;
        trips += 1;
        total += entryTotal(e);
        if (!e.invoiceId) unbilled += entryTotal(e);
      }
      const invoiceCount = invoices.filter((i) => i.companyId === c.id).length;
      m.set(c.id, { members: memberIds.size, trips, total, unbilled, invoices: invoiceCount });
    }
    return m;
  }, [companies, parties, entries, invoices]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return companies
      .filter((c) =>
        !n ? true : [c.name, c.address, c.gstin, c.contactPerson].join(" ").toLowerCase().includes(n)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [companies, q]);

  const totalUnbilled = useMemo(
    () => [...stats.values()].reduce((s, x) => s + x.unbilled, 0),
    [stats]
  );

  const valid = Boolean(draft?.name.trim());

  async function save() {
    if (!draft || !valid) return;
    await store.saveCompanyEntity({ ...draft, name: draft.name.trim() });
    setDraft(null);
  }

  const companyMemberCount = confirmDelete ? stats.get(confirmDelete.id)?.members ?? 0 : 0;
  const companyInvoiceCount = confirmDelete ? stats.get(confirmDelete.id)?.invoices ?? 0 : 0;

  return (
    <>
      <PageHeader
        title="Companies"
        subtitle="Group parties under one company — bill the company, entries still track by party."
        actions={
          <button
            onClick={() => {
              setDraft(blankCompany());
              setIsNew(true);
            }}
            className="btn-primary"
          >
            <Plus size={16} /> New company
          </button>
        }
      />

      <div className="stagger mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <Stat label="Companies" value={companies.length} />
        <Stat label="Parties grouped" value={parties.filter((p) => p.companyId).length} />
        <Stat label="Unbilled value" value={`₹${inr(totalUnbilled)}`} tone="gold" />
      </div>

      <Card bodyClassName="p-0">
        <div className="border-b border-navy-100 p-4">
          <div className="relative max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search companies…"
              className="pl-9"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Landmark size={32} />}
            title={companies.length ? "No matches" : "No companies yet"}
            message={
              companies.length
                ? "Try a different search."
                : "Create a company, then assign parties to it from the Parties tab to bill them together."
            }
            action={
              <button
                onClick={() => {
                  setDraft(blankCompany());
                  setIsNew(true);
                }}
                className="btn-primary"
              >
                <Plus size={16} /> New company
              </button>
            }
          />
        ) : (
          <Table
            head={
              <>
                <th className="th">Company</th>
                <th className="th">GSTIN</th>
                <th className="th">Contact</th>
                <th className="th text-right">Parties</th>
                <th className="th text-right">Trips</th>
                <th className="th text-right">Billed value</th>
                <th className="th text-right">Unbilled</th>
                <th className="th"></th>
              </>
            }
          >
            {filtered.map((c) => {
              const s = stats.get(c.id) ?? { members: 0, trips: 0, total: 0, unbilled: 0, invoices: 0 };
              return (
                <tr key={c.id} className="group transition hover:bg-navy-50/60">
                  <td className="td">
                    <Link
                      href={`/companies/${c.id}`}
                      className="font-bold text-navy-900 hover:underline"
                    >
                      {c.name}
                    </Link>
                    {c.code && (
                      <span className="ml-2 rounded bg-navy-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-navy-600">
                        {c.code}
                      </span>
                    )}
                  </td>
                  <td className="td font-mono text-xs">{c.gstin || "—"}</td>
                  <td className="td text-navy-600">
                    {c.contactPerson || c.phone ? (
                      <div className="leading-tight">
                        <div>{c.contactPerson || "—"}</div>
                        {c.phone && <div className="text-xs text-navy-400">{c.phone}</div>}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="td tabular text-right">{s.members}</td>
                  <td className="td tabular text-right">{s.trips}</td>
                  <td className="td tabular text-right font-semibold">₹{inr(s.total)}</td>
                  <td className="td tabular text-right">
                    {s.unbilled ? (
                      <span className="font-bold text-gold-700">₹{inr(s.unbilled)}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="td">
                    <div className="flex items-center justify-end gap-1 opacity-100 transition lg:opacity-0 lg:group-hover:opacity-100">
                      {s.unbilled > 0 && (
                        <Link
                          href={`/invoices?company=${c.id}`}
                          className="rounded-lg p-1.5 text-navy-500 hover:bg-navy-100"
                          title="Create invoice"
                        >
                          <FileText size={15} />
                        </Link>
                      )}
                      <button
                        onClick={() => {
                          setDraft(c);
                          setIsNew(false);
                        }}
                        className="rounded-lg p-1.5 text-navy-500 hover:bg-navy-100"
                        title="Edit"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(c)}
                        className="rounded-lg p-1.5 text-navy-400 hover:bg-red-50 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
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
        title={isNew ? "New company" : "Edit company"}
        subtitle="These details print on the invoice header when you bill this company."
        footer={
          <>
            <button className="btn-ghost" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save} disabled={!valid}>
              Save company
            </button>
          </>
        }
      >
        {draft && (
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="Company name" required className="sm:col-span-3">
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="MTC BUSINESS PVT LTD"
                />
              </Field>
              <Field label="Code" hint={`e.g. CST/${draft.code?.trim().toUpperCase() || "MTC"}/01/${today().slice(2, 4)}-…`}>
                <Input
                  value={draft.code ?? ""}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                  placeholder="MTC"
                  className="uppercase"
                  maxLength={12}
                />
              </Field>
            </div>
            <Field label="Address">
              <Textarea
                rows={3}
                value={draft.address ?? ""}
                onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                placeholder={"Head office address, printed on the bill"}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="GSTIN">
                <Input
                  value={draft.gstin ?? ""}
                  onChange={(e) => setDraft({ ...draft, gstin: e.target.value.toUpperCase() })}
                  placeholder="27AACCM4795M3ZR"
                  className="font-mono uppercase"
                />
              </Field>
              <Field label="PAN">
                <Input
                  value={draft.pan ?? ""}
                  onChange={(e) => setDraft({ ...draft, pan: e.target.value.toUpperCase() })}
                  placeholder="AACCM4795M"
                  className="font-mono uppercase"
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Contact person">
                <Input
                  value={draft.contactPerson ?? ""}
                  onChange={(e) => setDraft({ ...draft, contactPerson: e.target.value })}
                />
              </Field>
              <Field label="Phone">
                <Input
                  value={draft.phone ?? ""}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={draft.email ?? ""}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Notes">
              <Textarea
                rows={2}
                value={draft.notes ?? ""}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete this company?"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </button>
            <button
              className="btn-danger"
              onClick={async () => {
                if (confirmDelete) await store.deleteCompanyEntity(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm text-navy-600">
          <strong>{confirmDelete?.name}</strong> will be removed permanently.
          {companyMemberCount > 0 && (
            <>
              {" "}
              Its <strong>{companyMemberCount}</strong>{" "}
              {companyMemberCount === 1 ? "party stays" : "parties stay"} — they're just ungrouped
              from this company, not deleted.
            </>
          )}
          {companyInvoiceCount > 0 && (
            <>
              {" "}
              <strong>{companyInvoiceCount}</strong>{" "}
              {companyInvoiceCount === 1 ? "invoice" : "invoices"} billed to this company{" "}
              {companyInvoiceCount === 1 ? "is" : "are"} deleted — those entries go back to
              unbilled.
            </>
          )}
        </p>
      </Modal>
    </>
  );
}
