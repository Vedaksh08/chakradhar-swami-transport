-- Chakradhar Swami Transport — Supabase schema
-- Run this in the Supabase SQL editor, then put your keys in .env.local.
--
-- NOTE: column names are quoted camelCase so they match the app's TypeScript
-- model exactly and no field mapping is needed.

create table if not exists parties (
  id              text primary key,
  name            text not null,
  address         text,
  gstin           text,
  pan             text,
  "contactPerson" text,
  phone           text,
  email           text,
  notes           text,
  "createdAt"     timestamptz not null default now()
);

create table if not exists drivers (
  id                   text primary key,
  name                 text not null,
  address              text,
  phone                text,
  "licenceNo"          text,
  "panNo"              text,
  "aadhaarNo"          text,
  "policeVerification" text,
  active               boolean not null default true,
  notes                text,
  docs                 jsonb default '{}'::jsonb,
  "createdAt"          timestamptz not null default now()
);

create table if not exists invoices (
  id               text primary key,
  "invoiceNo"      text not null,
  date             date not null,
  "partyId"        text references parties (id) on delete restrict,
  "fromDate"       date not null,
  "toDate"         date not null,
  "entryIds"       jsonb not null default '[]'::jsonb,
  "freightAmount"  numeric(14,2) not null default 0,
  "sgstPercent"    numeric(6,2),
  "cgstPercent"    numeric(6,2),
  "gstPaidByParty" boolean not null default true,
  total            numeric(14,2) not null default 0,
  notes            text,
  "createdAt"      timestamptz not null default now()
);

create table if not exists entries (
  id                 text primary key,
  direction          text not null default 'outward'
                     check (direction in ('outward','inward')),
  "invoiceNo"        text not null,
  date               date not null,
  "partyId"          text references parties (id) on delete restrict,
  consignee          text,
  qty                numeric(14,3) not null default 0,
  rate               numeric(14,2) not null default 0,
  amount             numeric(14,2) not null default 0,
  detention          numeric(14,2),
  "detentionRemark"  text,
  "vehicleNo"        text not null default '',
  "driverId"         text references drivers (id) on delete set null,
  expenses           jsonb not null default '[]'::jsonb,
  "ackPhoto"         text,
  remarks            text,
  "invoiceId"        text references invoices (id) on delete set null,
  "createdAt"        timestamptz not null default now()
);

-- Single-row table holding our own company details.
create table if not exists company (
  id        int primary key default 1 check (id = 1),
  shree     text,
  name      text,
  address   text,
  email     text,
  phone     text,
  pan       text,
  gstin     text,
  logo      text
);

create index if not exists entries_date_idx      on entries (date);
create index if not exists entries_party_idx     on entries ("partyId");
create index if not exists entries_driver_idx    on entries ("driverId");
create index if not exists entries_invoice_idx   on entries ("invoiceId");
create index if not exists invoices_party_idx    on invoices ("partyId");

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Authentication is NOT wired up yet. These permissive policies let the anon
-- key read and write so the app works today. BEFORE going live with real data,
-- replace them with the authenticated block underneath.
-- ---------------------------------------------------------------------------

alter table parties  enable row level security;
alter table drivers  enable row level security;
alter table entries  enable row level security;
alter table invoices enable row level security;
alter table company  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['parties','drivers','entries','invoices','company'] loop
    execute format('drop policy if exists %I on %I', t || '_anon_all', t);
    execute format(
      'create policy %I on %I for all to anon, authenticated using (true) with check (true)',
      t || '_anon_all', t
    );
  end loop;
end $$;

-- When you add auth, swap the above for:
--
--   drop policy parties_anon_all on parties;   -- (and the rest)
--   create policy parties_auth_all on parties
--     for all to authenticated using (true) with check (true);
