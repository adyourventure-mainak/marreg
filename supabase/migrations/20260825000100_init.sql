-- MARREG :: core schema
-- Idempotent-ish initial migration. Run once against the Supabase project.

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------- enums
do $$ begin
  create type act_code as enum ('HMA_1955','SMA_13','SMA_16','ICMA_1872','PMDA_1936');
exception when duplicate_object then null; end $$;

do $$ begin
  create type application_status as enum (
    'DRAFT','PAYMENT_PENDING','SUBMITTED','UNDER_SCRUTINY','AWAITING_APPLICANT_FIX',
    'NOTICE_PUBLISHED','OBJECTION_UNDER_ENQUIRY','AWAITING_REGISTRATION','REGISTERED',
    'CERTIFICATE_ISSUED','CORRECTION_PENDING','CANCELLED','LAPSED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type party_role as enum ('BRIDE','GROOM','WIFE','HUSBAND');
exception when duplicate_object then null; end $$;

do $$ begin
  create type document_status as enum ('PENDING','VERIFIED','REJECTED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type document_type as enum (
    'PHOTO','SIGNATURE_LTI','AGE_PROOF','ADDRESS_PROOF','IDENTITY_PROOF','GUARDIAN_CONSENT',
    'DIVORCE_DECREE','DEATH_CERTIFICATE_SPOUSE','PRIEST_CERTIFICATE','AFFIDAVIT','OBJECTION_EVIDENCE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_role as enum (
    'APPLICANT','MARRIAGE_OFFICER','HINDU_REGISTRAR','DISTRICT_REGISTRAR','RGM_ADMIN','SUPPORT_READONLY','AUDITOR');
exception when duplicate_object then null; end $$;

do $$ begin
  create type objection_status as enum ('FILED','UNDER_ENQUIRY','UPHELD','DISMISSED','WITHDRAWN');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- geography
create table if not exists districts (
  code        text primary key,
  name        text not null,
  name_bn     text,
  division    text,
  created_at  timestamptz not null default now()
);

create table if not exists offices (
  id                uuid primary key default gen_random_uuid(),
  office_code       text unique not null,
  name              text not null,
  officer_name      text,
  designation       text,
  district_code     text not null references districts(code),
  sub_division      text,
  police_station    text,
  address           text not null,
  pincode           text,
  phone             text,
  email             text,
  acts              act_code[] not null default '{}',
  latitude          double precision,
  longitude         double precision,
  is_functional     boolean not null default true,
  source_url        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists offices_district_idx on offices(district_code) where is_functional;
create index if not exists offices_pincode_idx  on offices(pincode);
create index if not exists offices_search_idx   on offices
  using gin ((coalesce(name,'')||' '||coalesce(officer_name,'')||' '||coalesce(police_station,'')||' '||coalesce(address,'')) gin_trgm_ops);

-- ---------------------------------------------------------------- people
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  full_name    text,
  mobile       text,
  role         user_role not null default 'APPLICANT',
  office_id    uuid references offices(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- auto-provision a profile whenever an auth user is created (email or Google)
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function handle_new_user();

-- role helpers (security definer so RLS policies can call them without recursion)
create or replace function current_user_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function current_user_office() returns uuid
language sql stable security definer set search_path = public as $$
  select office_id from public.profiles where id = auth.uid()
$$;

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_user_role() <> 'APPLICANT', false)
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_user_role() in ('RGM_ADMIN','DISTRICT_REGISTRAR'), false)
$$;

-- ---------------------------------------------------------------- applications
create sequence if not exists application_serial;

create or replace function next_application_number() returns text
language sql volatile as $$
  select 'MR-' || to_char(now(),'YYYY') || '-' || lpad(nextval('application_serial')::text, 6, '0')
$$;

create table if not exists applications (
  id                        uuid primary key default gen_random_uuid(),
  application_number        text unique,
  owner_id                  uuid not null references auth.users(id) on delete cascade,
  act_code                  act_code not null,
  status                    application_status not null default 'DRAFT',
  office_id                 uuid references offices(id),
  district_code             text references districts(code),
  police_station            text,
  marriage_date             date,
  marriage_place            text,
  notice_receipt_date       date,
  receipt_date              date,
  objection_window_ends_at   date,
  registration_deadline_at   date,
  scheduled_for             date,
  registered_at             timestamptz,
  submitted_at              timestamptz,
  cancelled_reason          text,
  officer_note              text,
  fee_amount                numeric(12,2),
  current_step              int not null default 1,
  version                   int not null default 1,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index if not exists applications_owner_idx  on applications(owner_id);
create index if not exists applications_office_idx on applications(office_id, status);
create index if not exists applications_number_idx on applications(application_number);

create table if not exists parties (
  id                    uuid primary key default gen_random_uuid(),
  application_id        uuid not null references applications(id) on delete cascade,
  role                  party_role not null,
  name_english          text not null,
  name_bengali          text,
  date_of_birth         date not null,
  religion              text,
  nationality           text default 'Indian',
  marital_status_prior  text,
  occupation            text,
  father_name           text,
  mother_name           text,
  address_line1         text,
  address_line2         text,
  city                  text,
  district_code         text,
  pincode               text,
  contact_email         text,
  contact_mobile        text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (application_id, role)
);

create table if not exists witnesses (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references applications(id) on delete cascade,
  sequence        int not null,
  name            text not null,
  address         text,
  id_type         text,
  id_last_four    text,
  mobile          text,
  created_at      timestamptz not null default now(),
  unique (application_id, sequence)
);

create table if not exists documents (
  id                 uuid primary key default gen_random_uuid(),
  application_id     uuid not null references applications(id) on delete cascade,
  owner_party_id     uuid references parties(id) on delete set null,
  type               document_type not null,
  storage_path       text not null,
  file_name          text,
  mime_type          text,
  size_bytes         int,
  status             document_status not null default 'PENDING',
  rejection_reason   text,
  verified_by        uuid references auth.users(id),
  verified_at        timestamptz,
  created_at         timestamptz not null default now()
);
create index if not exists documents_app_idx on documents(application_id, type);

create table if not exists objections (
  id               uuid primary key default gen_random_uuid(),
  application_id   uuid not null references applications(id) on delete cascade,
  objector_name    text not null,
  objector_contact text,
  grounds          text not null,
  status           objection_status not null default 'FILED',
  filed_at         timestamptz not null default now(),
  resolved_at      timestamptz,
  resolution_note  text
);

create table if not exists audit_events (
  id              bigserial primary key,
  application_id  uuid references applications(id) on delete cascade,
  entity_type     text not null,
  entity_id       text,
  event           text not null,
  actor_id        uuid references auth.users(id),
  actor_role      user_role,
  before          jsonb,
  after           jsonb,
  occurred_at     timestamptz not null default now()
);
create index if not exists audit_app_idx on audit_events(application_id, occurred_at desc);

create table if not exists fee_schedule (
  id                uuid primary key default gen_random_uuid(),
  purpose           text not null,
  act_code          act_code,
  amount            numeric(12,2) not null,
  effective_from    date not null default current_date,
  effective_to      date,
  gazette_reference text
);

-- updated_at maintenance
create or replace function touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

do $$ declare t text;
begin
  foreach t in array array['offices','profiles','applications','parties'] loop
    execute format('drop trigger if exists touch_%1$s on %1$s', t);
    execute format('create trigger touch_%1$s before update on %1$s for each row execute function touch_updated_at()', t);
  end loop;
end $$;
