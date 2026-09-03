-- Chakradhar Swami Transport — Supabase schema
-- Run this in the Supabase SQL editor, then put your keys in .env.local.
--
-- NOTE: column names are quoted camelCase so they match the app's TypeScript
-- model exactly and no field mapping is needed.

-- A billing company groups several parties (branches/divisions) so they can
-- be invoiced together as one bill, even though entries still track the
-- individual party. Distinct from the single `company` table below, which
-- holds *your own* letterhead details.
create table if not exists companies (
  id              text primary key,
  name            text not null,
  code            text,
  address         text,
  gstin           text,
  pan             text,
  "contactPerson" text,
  phone           text,
  email           text,
  notes           text,
  "createdAt"     timestamptz not null default now()
);

create table if not exists parties (
  id              text primary key,
  name            text not null,
  code            text,
  address         text,
  gstin           text,
  pan             text,
  "contactPerson" text,
  phone           text,
  email           text,
  notes           text,
  "createdAt"     timestamptz not null default now()
);

-- Short code used to build invoice numbers: CST/MTC/01/26-27
alter table parties add column if not exists code text;

-- The company this party bills under, if any. Ungrouped (not deleted) if the
-- company is ever removed.
alter table parties add column if not exists "companyId" text references companies (id) on delete set null;
create index if not exists parties_company_idx on parties ("companyId");

create table if not exists vehicles (
  id                text primary key,
  number            text not null,
  make              text,
  type              text,
  "ownerName"       text,
  "capacityMt"      numeric(10,3),
  active            boolean not null default true,
  notes             text,
  "insuranceExpiry" date,
  "fitnessExpiry"   date,
  "permitExpiry"    date,
  "pucExpiry"       date,
  expenses          jsonb not null default '[]'::jsonb,
  "createdAt"       timestamptz not null default now()
);

create unique index if not exists vehicles_number_idx on vehicles (upper(number));

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
  "monthlyPay"         numeric(14,2),
  advances             jsonb not null default '[]'::jsonb,
  docs                 jsonb default '{}'::jsonb,
  "createdAt"          timestamptz not null default now()
);

-- Existing databases: add the pay/advance columns without touching data.
alter table drivers add column if not exists "monthlyPay" numeric(14,2);
alter table drivers add column if not exists advances jsonb not null default '[]'::jsonb;

create table if not exists invoices (
  id               text primary key,
  "invoiceNo"      text not null,
  date             date not null,
  -- Exactly one of partyId / companyId is set — see the Invoice type.
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

-- A bill made out to a company instead of one party — the app deletes an
-- invoice's own row before ever removing the company it bills, but this is
-- set null as a non-destructive default for anything done outside the app.
alter table invoices add column if not exists "companyId" text references companies (id) on delete set null;
create index if not exists invoices_company_idx on invoices ("companyId");

-- 'trip' (the default) pulls in entries as usual; 'other' is a standalone,
-- hand-entered charge with no entries attached.
alter table invoices add column if not exists kind text not null default 'trip';

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
  "driverExpenses"   jsonb not null default '[]'::jsonb,
  "vehicleExpenses"  jsonb not null default '[]'::jsonb,
  photos             jsonb not null default '[]'::jsonb,
  remarks            text,
  "invoiceId"        text references invoices (id) on delete set null,
  "createdAt"        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Migration for databases created before expenses were split.
--
-- Old shape: one `expenses` list + a single `ackPhoto`.
-- New shape: driverExpenses + vehicleExpenses, and a list of named photos.
-- Existing costs move to vehicleExpenses (diesel and toll were the bulk of
-- what was recorded), and any acknowledgment photo becomes the first photo.
-- Safe to re-run; the old columns are left in place so nothing is lost.
-- ---------------------------------------------------------------------------

alter table entries add column if not exists "driverExpenses"  jsonb not null default '[]'::jsonb;
alter table entries add column if not exists "vehicleExpenses" jsonb not null default '[]'::jsonb;
alter table entries add column if not exists photos            jsonb not null default '[]'::jsonb;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'entries' and column_name = 'expenses'
  ) then
    update entries
       set "vehicleExpenses" = expenses
     where "vehicleExpenses" = '[]'::jsonb
       and expenses is not null
       and expenses <> '[]'::jsonb;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_name = 'entries' and column_name = 'ackPhoto'
  ) then
    update entries
       set photos = jsonb_build_array(
             jsonb_build_object('id', id || '-ack', 'name', 'Acknowledgment', 'src', "ackPhoto")
           )
     where photos = '[]'::jsonb
       and "ackPhoto" is not null
       and "ackPhoto" <> '';
  end if;
end $$;

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
  "invoicePrefix" text,
  logo      text
);

alter table company add column if not exists "invoicePrefix" text;

create index if not exists entries_date_idx      on entries (date);
create index if not exists entries_party_idx     on entries ("partyId");
create index if not exists entries_driver_idx    on entries ("driverId");
create index if not exists entries_invoice_idx   on entries ("invoiceId");
create index if not exists entries_vehicle_idx   on entries ("vehicleNo");
create index if not exists invoices_party_idx    on invoices ("partyId");

-- ---------------------------------------------------------------------------
-- Row Level Security  — SIGNED-IN USERS ONLY
--
-- Every table is readable and writable only by a logged-in Supabase user.
-- The anon key on its own can do nothing, so even though that key ships in the
-- browser bundle, it is useless without a valid login.
--
-- Safe to re-run: it drops the old permissive policies first.
-- ---------------------------------------------------------------------------

alter table parties   enable row level security;
alter table companies enable row level security;
alter table drivers   enable row level security;
alter table vehicles  enable row level security;
alter table entries   enable row level security;
alter table invoices  enable row level security;
alter table company   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['parties','companies','drivers','vehicles','entries','invoices','company'] loop
    -- remove the earlier wide-open policy, if it is still there
    execute format('drop policy if exists %I on %I', t || '_anon_all', t);
    execute format('drop policy if exists %I on %I', t || '_auth_all', t);

    execute format(
      'create policy %I on %I for all to authenticated using (true) with check (true)',
      t || '_auth_all', t
    );
  end loop;
end $$;

-- Users are created by hand in the Supabase dashboard:
--   Authentication -> Users -> Add user -> Create new user
--   (tick "Auto Confirm User" so no confirmation email is needed)
--
-- There is no public sign-up in the app, so the only accounts that exist are
-- the ones you create there. To revoke someone, delete their user.
--
-- Verify the lockdown from a terminal — this must return an empty result or a
-- permission error, never your data:
--   curl "$SUPABASE_URL/rest/v1/entries?select=id" \
--        -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
