-- MARREG :: verified Marriage Officer directory
--
-- Backs the district-wise Marriage Officer / Hindu Marriage Registrar lists
-- published by the Office of the Registrar General of Marriages, Government of
-- West Bengal. 554 officers across the 23 districts, extracted from the
-- department's own NIC-generated PDFs.
--
-- Two rules shape this schema:
--
--   1. NOTHING IS PUBLIC UNTIL A HUMAN APPROVES IT. Extraction is mechanical
--      and can be wrong. Every imported row lands as PENDING_REVIEW and is
--      invisible to citizens until registry staff verify it. The read policy,
--      not the application code, is what enforces that.
--
--   2. EVERY RECORD CARRIES ITS PROVENANCE. Source PDF, page number, the date
--      the department generated it, and who verified it and when. A citizen
--      travelling to an office on this information must be able to see where
--      it came from.

-- ------------------------------------------------------------------- enums
do $$ begin
  create type verification_status as enum ('PENDING_REVIEW','VERIFIED','REJECTED');
exception when duplicate_object then null; end $$;

-- The Jurisdiction column of the source is typed: police stations dominate,
-- but blocks, municipalities and sub-divisions also appear. Flattening them
-- would misstate the legal extent of an officer's authority.
do $$ begin
  create type jurisdiction_area_type as enum
    ('POLICE_STATION','MUNICIPALITY','MUNICIPAL_CORPORATION','BLOCK','SUB_DIVISION','UNSPECIFIED');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------------ columns
alter table offices
  add column if not exists verification_status verification_status not null default 'PENDING_REVIEW',
  add column if not exists working_hours       jsonb,
  add column if not exists phones              text[] not null default '{}',
  add column if not exists locality            text,
  add column if not exists city                text,
  add column if not exists source_document     text,
  add column if not exists source_page         int check (source_page > 0),
  add column if not exists source_generated_on date,
  add column if not exists verified_by         uuid references auth.users(id),
  add column if not exists verified_at         timestamptz,
  add column if not exists review_note         text;

comment on column offices.verification_status is
  'PENDING_REVIEW until registry staff confirm the row against the source PDF. Only VERIFIED rows are visible to the public.';
comment on column offices.source_document is
  'Filename of the district PDF published by the Office of the Registrar General of Marriages.';
comment on column offices.source_generated_on is
  'The "Generated On" date printed on the source PDF, not the import date.';

-- The structural placeholder offices seeded earlier are not the official
-- directory (see supabase/seed/002_offices.sql, which says so). They must not
-- keep their public visibility now that a review gate exists.
update offices
   set verification_status = 'PENDING_REVIEW',
       review_note = coalesce(review_note,
         'Structural placeholder from the initial seed. Not from the official directory.')
 where source_document is null
   and verification_status <> 'REJECTED';

-- ----------------------------------------------------------- jurisdictions
create table if not exists office_jurisdictions (
  id         uuid primary key default gen_random_uuid(),
  office_id  uuid not null references offices(id) on delete cascade,
  area_name  text not null,
  area_type  jurisdiction_area_type not null,
  raw_label  text not null,
  created_at timestamptz not null default now(),
  unique (office_id, area_name, area_type)
);

comment on table office_jurisdictions is
  'One row per area an officer serves, exactly as listed in the Jurisdiction column of the source PDF.';

-- --------------------------------------------------------------- indexes
create index if not exists offices_verified_idx    on offices (verification_status);
create index if not exists offices_district_idx    on offices (district_code);
create index if not exists offices_pincode_idx     on offices (pincode);
create index if not exists offices_search_trgm_idx on offices
  using gin ((coalesce(name,'') || ' ' || coalesce(officer_name,'') || ' ' ||
              coalesce(address,'') || ' ' || coalesce(locality,'') || ' ' ||
              coalesce(city,'')) gin_trgm_ops);
create index if not exists office_jurisdictions_office_idx on office_jurisdictions (office_id);
create index if not exists office_jurisdictions_name_idx   on office_jurisdictions (upper(area_name));
create index if not exists office_jurisdictions_trgm_idx   on office_jurisdictions
  using gin (area_name gin_trgm_ops);

-- ------------------------------------------------------------------- RLS
-- The old policy was `using (true)`: it would expose every unreviewed import
-- the moment the rows landed.
drop policy if exists offices_read on offices;
create policy offices_read on offices for select
  using (verification_status = 'VERIFIED' or is_staff());

alter table office_jurisdictions enable row level security;

drop policy if exists office_jurisdictions_read on office_jurisdictions;
create policy office_jurisdictions_read on office_jurisdictions for select
  using (exists (select 1 from offices o
                 where o.id = office_id
                   and (o.verification_status = 'VERIFIED' or is_staff())));

drop policy if exists office_jurisdictions_admin_write on office_jurisdictions;
create policy office_jurisdictions_admin_write on office_jurisdictions for all
  using (is_admin()) with check (is_admin());

grant select on office_jurisdictions to anon, authenticated;
-- Writes go through the import (service role) and the review function below.
revoke insert, update, delete on office_jurisdictions from anon, authenticated;
revoke insert, update, delete on offices from anon, authenticated;

-- ------------------------------------------------------------ office search
-- Replaces the 3-argument form: citizens must be able to search by police
-- station, PIN code and locality, none of which the old signature supported.
drop function if exists search_offices(text, text, act_code);

create function search_offices(
  p_query          text     default null,
  p_district       text     default null,
  p_act            act_code default null,
  p_police_station text     default null,
  p_pincode        text     default null)
returns setof offices
language sql stable security invoker set search_path = public as $$
  select o.* from offices o
  where o.is_functional
    -- SECURITY INVOKER, so the read policy above applies: an unverified row is
    -- invisible here for exactly the same reason it is invisible everywhere.
    and (p_district is null or o.district_code = p_district)
    and (p_act is null or p_act = any(o.acts))
    and (p_pincode is null or p_pincode = '' or o.pincode = trim(p_pincode))
    and (p_police_station is null or p_police_station = '' or exists (
          select 1 from office_jurisdictions j
          where j.office_id = o.id
            and upper(j.area_name) = upper(trim(p_police_station))))
    and (p_query is null or p_query = '' or
         (coalesce(o.name,'') || ' ' || coalesce(o.officer_name,'') || ' ' ||
          coalesce(o.police_station,'') || ' ' || coalesce(o.address,'') || ' ' ||
          coalesce(o.locality,'') || ' ' || coalesce(o.city,'') || ' ' ||
          coalesce(o.pincode,'')) ilike '%' || p_query || '%')
  order by o.district_code, o.name
  limit 200
$$;

grant execute on function search_offices(text, text, act_code, text, text) to anon, authenticated;

-- --------------------------------------------------------- jurisdiction help
-- "Which officer covers my police station?" — the question the directory
-- exists to answer. Returns only verified officers, by the same policy.
create or replace function offices_for_area(p_area text)
returns table (
  office_id uuid, office_name text, officer_name text, district_code text,
  address text, pincode text, phones text[], area_name text,
  area_type jurisdiction_area_type)
language sql stable security invoker set search_path = public as $$
  select o.id, o.name, o.officer_name, o.district_code, o.address, o.pincode,
         o.phones, j.area_name, j.area_type
  from office_jurisdictions j
  join offices o on o.id = j.office_id
  where upper(j.area_name) = upper(trim(p_area))
    and o.is_functional
  order by o.district_code, o.name
$$;

grant execute on function offices_for_area(text) to anon, authenticated;

-- ------------------------------------------------------------------ review
-- The human gate. Staff only, and every decision is audited.
create or replace function review_office(
  p_office uuid, p_status verification_status, p_note text default null)
returns offices
language plpgsql security definer set search_path = public as $$
declare office offices;
begin
  if auth.uid() is null then raise exception 'Sign in to review directory entries'; end if;
  if not is_staff() then raise exception 'Only registry staff may verify directory entries'; end if;
  if p_status = 'PENDING_REVIEW' then
    raise exception 'A review must record a decision: VERIFIED or REJECTED';
  end if;

  update offices
     set verification_status = p_status,
         review_note = p_note,
         verified_by = auth.uid(),
         verified_at = now(),
         updated_at = now()
   where id = p_office
  returning * into office;

  if not found then raise exception 'Directory entry not found'; end if;

  perform log_audit(null, 'office', p_office::text, 'office:' || p_status,
                    null, jsonb_build_object('status', p_status, 'note', p_note));
  return office;
end $$;

grant execute on function review_office(uuid, verification_status, text) to authenticated;
