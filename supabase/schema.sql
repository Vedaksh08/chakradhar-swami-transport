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

-- Inward and outward trips are billed apart — a trip invoice only ever pulls
-- entries running in its own direction. Null on invoices raised before the split.
alter table invoices add column if not exists direction text
  check (direction in ('outward','inward'));

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
-- Accounts, approvals and the audit trail
--
-- One row per person who can sign in. The password is NOT here — Supabase Auth
-- holds it — and `id` is the auth user's own id, so the two always line up.
-- Rows are only ever written by the server using the service-role key, which
-- is why there is no insert/update policy below: the owner's screen is the
-- only way in.
-- ---------------------------------------------------------------------------

create table if not exists app_users (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null unique,
  name        text not null,
  role        text not null default 'staff' check (role in ('owner','staff')),
  permissions jsonb not null default '[]'::jsonb,
  active      boolean not null default true,
  "createdAt" timestamptz not null default now()
);

-- A staff edit or deletion parked until the owner accepts it.
create table if not exists change_requests (
  id          text primary key,
  "userId"    uuid,
  "userName"  text not null,
  kind        text not null check (kind in ('update','delete')),
  entity      text not null,
  "recordId"  text not null,
  payload     jsonb,
  previous    jsonb,
  summary     text not null,
  status      text not null default 'pending'
              check (status in ('pending','approved','rejected')),
  note        text,
  "createdAt" timestamptz not null default now(),
  "decidedAt" timestamptz,
  "decidedBy" text
);

create index if not exists change_requests_status_idx on change_requests (status);

-- Everything staff do, for the owner to read back.
create table if not exists activity_log (
  id          text primary key,
  "userId"    uuid,
  "userName"  text not null,
  action      text not null,
  entity      text not null,
  "recordId"  text,
  summary     text not null,
  at          timestamptz not null default now()
);

create index if not exists activity_log_at_idx on activity_log (at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security  — SIGNED-IN USERS ONLY, AND ONLY WHAT THEY'RE ALLOWED
--
-- Nothing is reachable with the anon key alone, so even though that key ships
-- in the browser bundle it is useless without a valid login.
--
-- On top of that, writes are checked against the signed-in account's
-- permissions. This is the real boundary — hiding a tab in the app is only a
-- convenience, but these policies hold even against someone poking the API by
-- hand.
--
-- An account with NO app_users row counts as the owner. That keeps the
-- original dashboard-made login working exactly as before.
--
-- Safe to re-run: old policies are dropped first.
-- ---------------------------------------------------------------------------

create or replace function app_is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select u.role = 'owner' and u.active from app_users u where u.id = auth.uid()),
    true
  );
$$;

create or replace function app_can(perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select u.active and (u.role = 'owner' or u.permissions ? perm)
       from app_users u where u.id = auth.uid()),
    true
  );
$$;

alter table parties         enable row level security;
alter table companies       enable row level security;
alter table drivers         enable row level security;
alter table vehicles        enable row level security;
alter table entries         enable row level security;
alter table invoices        enable row level security;
alter table company         enable row level security;
alter table app_users       enable row level security;
alter table change_requests enable row level security;
alter table activity_log    enable row level security;

do $$
declare
  t    text;
  perm text;
  tables text[] := array[
    'parties','companies','drivers','vehicles','entries','invoices','company'
  ];
  perms  text[] := array[
    'parties','companies','drivers','vehicles','entries','invoices','settings'
  ];
  i int;
begin
  for i in 1 .. array_length(tables, 1) loop
    t := tables[i];
    perm := perms[i];

    execute format('drop policy if exists %I on %I', t || '_anon_all', t);
    execute format('drop policy if exists %I on %I', t || '_auth_all', t);
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_add', t);
    execute format('drop policy if exists %I on %I', t || '_edit', t);
    execute format('drop policy if exists %I on %I', t || '_erase', t);

    -- Reading stays open to anyone signed in: an entry clerk still needs the
    -- party, driver and vehicle lists to fill the form in front of them.
    execute format(
      'create policy %I on %I for select to authenticated using (true)',
      t || '_read', t
    );

    execute format(
      'create policy %I on %I for insert to authenticated with check (app_can(%L))',
      t || '_add', t, perm
    );

    if t = 'entries' then
      -- The heart of it: staff add trips, but changing or removing one
      -- afterwards belongs to the owner. Whoever handles invoicing can also
      -- touch entries, since raising a bill stamps them.
      execute format(
        'create policy %I on %I for update to authenticated using (app_is_owner() or app_can(''invoices'')) with check (app_is_owner() or app_can(''invoices''))',
        t || '_edit', t
      );
      execute format(
        'create policy %I on %I for delete to authenticated using (app_is_owner() or app_can(''invoices''))',
        t || '_erase', t
      );
    else
      execute format(
        'create policy %I on %I for update to authenticated using (app_can(%L)) with check (app_can(%L))',
        t || '_edit', t, perm, perm
      );
      execute format(
        'create policy %I on %I for delete to authenticated using (app_can(%L))',
        t || '_erase', t, perm
      );
    end if;
  end loop;
end $$;

-- Accounts: everyone signed in can read (the app needs to know its own
-- permissions), but only the service-role key writes — no policy grants it.
drop policy if exists app_users_read on app_users;
create policy app_users_read on app_users for select to authenticated using (true);

-- Requests: anyone signed in can raise one and see the queue; only the owner
-- decides.
drop policy if exists change_requests_read on change_requests;
drop policy if exists change_requests_add on change_requests;
drop policy if exists change_requests_decide on change_requests;
drop policy if exists change_requests_erase on change_requests;
create policy change_requests_read on change_requests for select to authenticated using (true);
create policy change_requests_add on change_requests for insert to authenticated with check (true);
create policy change_requests_decide on change_requests for update to authenticated
  using (app_is_owner()) with check (app_is_owner());
create policy change_requests_erase on change_requests for delete to authenticated
  using (app_is_owner());

-- Audit trail: append-only. Nobody can rewrite or erase their own tracks,
-- because no update or delete policy exists.
drop policy if exists activity_log_read on activity_log;
drop policy if exists activity_log_add on activity_log;
create policy activity_log_read on activity_log for select to authenticated using (true);
create policy activity_log_add on activity_log for insert to authenticated with check (true);

-- ---------------------------------------------------------------------------
-- Live updates
--
-- Puts each table on Supabase's realtime publication so a change made by one
-- person appears on everyone else's screen straight away, instead of only
-- after they reload. Row Level Security still applies to what gets delivered.
--
-- Safe to re-run: a table already on the publication is skipped.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array[
    'parties','companies','drivers','vehicles','entries','invoices','company',
    'app_users','change_requests','activity_log'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- The first account is still made by hand in the Supabase dashboard:
--   Authentication -> Users -> Add user -> Create new user
--   (tick "Auto Confirm User" so no confirmation email is needed)
--
-- It has no app_users row, so it counts as the owner. Everyone after that is
-- created from the app's Users screen, which needs SUPABASE_SERVICE_ROLE_KEY
-- set on the server (Vercel -> Settings -> Environment Variables). To revoke
-- someone, delete them there or untick Active.
--
-- Verify the lockdown from a terminal — this must return an empty result or a
-- permission error, never your data:
--   curl "$SUPABASE_URL/rest/v1/entries?select=id" \
--        -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
