\set ON_ERROR_STOP on
-- Two citizens and one Marriage Officer.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','couple@example.com'),
  ('22222222-2222-2222-2222-222222222222','officer@example.com');

select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
\echo '--- profile auto-created by trigger?'
select id, email, role from profiles order by email;

-- make user 2 the officer at the Kolkata office
update profiles set role='MARRIAGE_OFFICER',
  office_id=(select id from offices where district_code='WB-KOL' limit 1)
where id='22222222-2222-2222-2222-222222222222';

\echo '--- office search (Kolkata, Hindu Marriage Act)'
select office_code, name from search_offices(null,'WB-KOL','HMA_1955');

-- ---------------------------------------------------------------- applicant
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);

insert into applications (owner_id, act_code) values ('11111111-1111-1111-1111-111111111111','HMA_1955');

\echo '--- submit with nothing filled in (must fail)'
do $$ begin
  perform submit_application((select id from applications limit 1));
  raise exception 'BUG: empty application was accepted';
exception when others then raise notice 'correctly rejected: %', sqlerrm;
end $$;

insert into parties (application_id, role, name_english, date_of_birth) values
  ((select id from applications limit 1),'WIFE','Ananya Sen','1996-04-12'),
  ((select id from applications limit 1),'HUSBAND','Rahul Bose','1994-09-03');

update applications set office_id=(select id from offices where district_code='WB-KOL' limit 1),
  district_code='WB-KOL', marriage_date='2026-06-14';

\echo '--- submit with no documents (must fail)'
do $$ begin
  perform submit_application((select id from applications limit 1));
  raise exception 'BUG: application without documents was accepted';
exception when others then raise notice 'correctly rejected: %', sqlerrm;
end $$;

insert into documents (application_id, type, storage_path, mime_type, size_bytes)
values ((select id from applications limit 1),'IDENTITY_PROOF','x/id.pdf','application/pdf',1000);

\echo '--- submit for real'
select application_number, status, receipt_date, objection_window_ends_at, registration_deadline_at
from submit_application((select id from applications limit 1));

\echo '--- applicant tries an officer-only transition (must fail)'
do $$ begin
  perform transition_application((select id from applications limit 1),'officerAssigned');
  raise exception 'BUG: applicant moved the state machine';
exception when others then raise notice 'correctly rejected: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------- officer
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);

\echo '--- illegal transition (must fail)'
do $$ begin
  perform transition_application((select id from applications limit 1),'registered');
  raise exception 'BUG: illegal transition allowed';
exception when others then raise notice 'correctly rejected: %', sqlerrm;
end $$;

\echo '--- legal workflow'
select status from transition_application((select id from applications limit 1),'officerAssigned');
select status from transition_application((select id from applications limit 1),'approveNotice');
select status from transition_application((select id from applications limit 1),'objectionWindowClosed');
select status from transition_application((select id from applications limit 1),'registered');
select status from transition_application((select id from applications limit 1),'certificateIssued');

\echo '--- audit trail'
select event, actor_role from audit_events order by occurred_at;

\echo '--- public tracking by number + dob'
reset role;
select application_number, status, office_name from track_application(
  (select application_number from applications limit 1), '1996-04-12');

\echo '--- tracking with the wrong dob (must return nothing)'
select count(*) as should_be_zero from track_application(
  (select application_number from applications limit 1), '1990-01-01');
