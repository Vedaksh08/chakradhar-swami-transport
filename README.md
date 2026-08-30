# Chakradhar Swami Transport — Billing Platform

Trip entries, party billing, driver records and invoicing for Chakradhar Swami Transport.

Built with Next.js 14 (App Router) + TypeScript + Tailwind. Deploys to Vercel.
Runs **fully offline on browser storage today** and switches to Supabase the moment
you add keys — no code changes required.

---

## Run it

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000

> **Folder name note:** the project must live in a path with **no `!` character**.
> Webpack reserves `!` for loader syntax and refuses to build. That is why this
> lives in `TRANSPORT` and not `TRANSPORT !`.

---

## The five tabs

| Tab | What it does |
|---|---|
| **Dashboard** | Vehicles sent per party for today / week / month / all time, billable value, driver expenses, net, detention charged, unbilled alert, recent trips. |
| **Entries** | Create a trip: direction (outward/inward), invoice no., date, party, qty × rate → **amount (auto, editable)**, vehicle no., driver, **detention (optional — adds to the total)**, driver expenses, acknowledgment photo. Filter by date/party/driver/direction, export CSV. |
| **Invoices** | Pick a party + a date range → every unbilled entry in that window is pulled in automatically. Invoice no. auto-increments and stays editable. Prints the invoice **and** the entry report. |
| **Drivers** | Documents (PAN, Aadhaar, licence, police verification + scans), trip history, expenses this month, expenses by type, lifetime totals. |
| **Parties** | Company name, branch address, GSTIN/PAN, contact. Feeds the invoice header automatically. |

---

## How the money works

Verified against `CST DAILY.xlsx` and `Entry Report.pdf`:

```
amount        = qty × rate          (auto-filled, but freely editable)
entry total   = amount + detention
driver cost   = sum of the trip's expense lines
net           = entry total − driver cost
invoice total = sum of the entry totals in the range (+ GST if charged)
```

**Amount is editable on purpose.** In your real data many trips bill at a flat
rate regardless of weight (10.370, 11.990 and 31.350 MT all billed ₹7,500), so
`qty × rate` is only a starting point. Edit it and the field turns gold; press
**Auto** to snap it back.

**Driver expenses are never billed to the party.** They sit against the driver
and reduce your net.

**GST** defaults to *paid by party* (reverse charge), matching invoice CST/23 —
so nothing is added. Untick it to charge SGST/CGST.

---

## Printing

`Invoices → click an invoice → Print / Save PDF` produces two A4 pages:

1. **The invoice** — matches `chakradhar_swami_transport_invoice_professional.html`:
   letterhead, bill-to, `TRANSPORTATION CHARGES AS PER DETAIL ATTACHED`,
   freight amount, GST rows, total, amount in Indian words, signatures.
2. **The entry report** — matches `Entry Report.pdf`:
   `DATE | NAME | QTY | AMT | VEH NO` with the total row.

The **NAME** column uses each entry's *Delivered to* field (the consignee, e.g.
`WHEELS INDIA LTD`), falling back to the billing party when blank.

---

## Connecting Supabase

1. Run `supabase/schema.sql` in the Supabase SQL editor.
2. Copy `.env.local.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

3. Restart the dev server. The sidebar badge flips from
   *Local storage* to *Supabase*.

Before switching, go to **Settings → Download backup** to grab your local data
as JSON, then **Restore from file** once Supabase is connected.

Columns are quoted camelCase so they match the TypeScript model exactly — no
field mapping anywhere.

### Authentication — OPEN, ON PURPOSE, FOR NOW

> ⚠️ **The live site currently has no login and the database is unprotected.**
>
> `schema.sql` grants the `anon` key full read/write, and that key is embedded in
> the browser bundle by design (`NEXT_PUBLIC_`). So **anyone who knows the URL can
> read, edit and delete every invoice, party and driver record.**
>
> This was a deliberate choice to get the site live quickly, on the basis that the
> URL is not published anywhere yet. It is **not** safe to share the link, put it
> on a business card, or let it get indexed until this is closed.

To close it:

1. Add Supabase Auth (email + password is enough for a small team).
2. In `supabase/schema.sql`, swap the `*_anon_all` policies for the
   `authenticated` block at the bottom of that file, and re-run it.
3. Redeploy.

Until then, take regular backups from **Settings → Download backup** — that is
the only thing standing between you and someone wiping the data.

---

## Deploying to Vercel

```bash
npx vercel
```

Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the Vercel
project's environment variables. The `!`-in-path problem does not exist on
Vercel — it only affected the local Desktop folder.

---

## Layout

```
src/
  app/
    page.tsx                     dashboard
    entries/page.tsx
    invoices/page.tsx            list + invoice builder
    invoices/[id]/print/page.tsx invoice + entry report, print-ready
    drivers/page.tsx
    drivers/[id]/page.tsx        documents, trips, expense breakdown
    parties/page.tsx
    settings/page.tsx            company details, backup, storage
  components/
    Shell.tsx                    sidebar + chrome
    ui.tsx                       inputs, cards, modal, table, image picker
    EntryForm.tsx
    DriverForm.tsx
    InvoiceSheet.tsx             the A4 invoice
    EntryReportSheet.tsx         the A4 annexure
  lib/
    types.ts    domain model
    calc.ts     totals, Indian currency + amount-in-words, dates
    repo.ts     storage abstraction (local | supabase)
    store.tsx   React state + persistence
    csv.ts
supabase/schema.sql
```

Reference documents (`CST DAILY.xlsx`, `SCST 23.pdf`, `Entry Report.pdf`,
the invoice HTML) are kept in the project root.
