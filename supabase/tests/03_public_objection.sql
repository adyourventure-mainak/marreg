\set ON_ERROR_STOP on
-- Fresh application taken as far as NOTICE_PUBLISHED by 01_application_flow.sql
-- is already CERTIFICATE_ISSUED, so build a second one to object against.
insert into auth.users (id, email) values ('44444444-4444-4444-4444-444444444444','couple2@example.com');
select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444', false);
insert into applications (owner_id, act_code, office_id, district_code, marriage_date)
values ('44444444-4444-4444-4444-444444444444','SMA_16',
        (select id from offices where district_code='WB-KOL' limit 1),'WB-KOL','2026-01-10');
insert into parties (application_id, role, name_english, date_of_birth) values
  ((select id from applications where act_code='SMA_16'),'WIFE','Priya Das','1997-02-20'),
  ((select id from applications where act_code='SMA_16'),'HUSBAND','Arjun Roy','1995-11-08');
insert into documents (application_id, type, storage_path, mime_type, size_bytes)
values ((select id from applications where act_code='SMA_16'),'AGE_PROOF','y/age.pdf','application/pdf',900);
select application_number from submit_application((select id from applications where act_code='SMA_16'));

select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
select status from transition_application((select id from applications where act_code='SMA_16'),'officerAssigned');
select status from transition_application((select id from applications where act_code='SMA_16'),'approveNotice');

-- Capture the numbers while still privileged: an anonymous visitor gets these
-- from the published notice, not from the database.
select application_number as sma_number from applications where act_code='SMA_16' \gset
select application_number as hma_number from applications where act_code='HMA_1955' \gset

\echo '--- ANONYMOUS visitor files an objection (the case that was broken)'
reset role;
set role anon;
select set_config('request.jwt.claim.sub','', false);
select file_objection(:'sma_number','Sujata Ghosh','9800000000',
  'The groom has an undissolved prior marriage.') as objected_against;

\echo '--- anonymous visitor still cannot read the application itself (must be denied)'
do $$ begin
  perform count(*) from applications;
  raise exception 'BUG: anonymous visitor read the applications table';
exception when others then raise notice 'correctly denied: %', sqlerrm; end $$;

\echo '--- anonymous visitor cannot read objections back (must be denied)'
do $$ begin
  perform count(*) from objections;
  raise exception 'BUG: anonymous visitor read the objections table';
exception when others then raise notice 'correctly denied: %', sqlerrm; end $$;
\echo '--- objecting to a number that does not exist (must fail)'
do $$ begin
  perform file_objection('MR-2026-999999','X','','grounds');
  raise exception 'BUG: accepted an unknown application number';
exception when others then raise notice 'correctly rejected: %', sqlerrm; end $$;
\echo '--- objecting to an application not in its notice period (must fail)'
-- psql does not interpolate :vars inside dollar-quoted blocks, so this block
-- reads the number itself; it runs unprivileged only to prove the period check,
-- which is separate from the RLS checks above.
reset role;
do $$
declare n text;
begin
  select application_number into n from applications where act_code = 'HMA_1955';
  perform file_objection(n, 'X', '', 'grounds');
  raise exception 'BUG: accepted an objection outside the notice period';
exception when others then raise notice 'correctly rejected: %', sqlerrm; end $$;

\echo '--- the OFFICER can read the objection'
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
select objector_name, status from objections;

\echo '--- a signed-in applicant cannot INSERT an objection directly (regression)'
-- Migration 400 revoked insert from `anon` but not from `authenticated`, so a
-- signed-in user could bypass every check in file_objection(). Migration 600
-- revokes it from `authenticated` too and drops the `with check (true)` policy.
--
-- The `BUG:` raise uses sqlstate 'MR001' so the `when others` handler can let
-- it through instead of swallowing the failure it is meant to report.
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444', false);
do $$
declare a uuid;
begin
  select id into a from applications where act_code = 'HMA_1955';
  insert into objections (application_id, objector_name, grounds)
  values (a, 'Mallory', 'fabricated objection against a closed notice');
  raise exception using errcode = 'MR001',
    message = 'BUG: an authenticated user inserted an objection directly';
exception
  when sqlstate 'MR001' then raise;
  when others then raise notice 'correctly denied: %', sqlerrm;
end $$;
