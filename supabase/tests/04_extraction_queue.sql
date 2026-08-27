\set ON_ERROR_STOP on
-- Layer 2: the extraction queue, and the guarantee that extraction can never
-- verify or reject a document.

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001','couple2@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000002','officer2@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000003','stranger2@example.com');

update profiles set role='MARRIAGE_OFFICER',
  office_id=(select id from offices where district_code='WB-KOL' limit 1)
where id='aaaaaaaa-0000-0000-0000-000000000002';

set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', false);

insert into applications (id, owner_id, act_code, office_id, district_code)
values ('bbbbbbbb-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001','HMA_1955',
        (select id from offices where district_code='WB-KOL' limit 1),'WB-KOL');

-- --------------------------------------------------------------- enqueueing
\echo '--- a text document is queued; a photograph is skipped'
insert into documents (id, application_id, type, storage_path, mime_type, size_bytes) values
  ('cccccccc-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001',
   'IDENTITY_PROOF','bbbbbbbb-0000-0000-0000-000000000001/id.pdf','application/pdf',1000),
  ('cccccccc-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000001',
   'PHOTO','bbbbbbbb-0000-0000-0000-000000000001/photo.jpg','image/jpeg',2000);

select type, ai_status from documents
 where application_id='bbbbbbbb-0000-0000-0000-000000000001' order by type;

\echo '--- one job queued (the photo must not create one) — expect 1'
reset role;
select count(*) as queued_jobs from extraction_jobs;

-- ----------------------------------------------------------------- claiming
\echo '--- claim it: status RUNNING, attempts 1'
select job_id is not null as got_job, document_type, storage_path, attempts
  from claim_extraction_jobs(5,'test-worker');

\echo '--- claiming again immediately returns nothing (lock is fresh) — expect 0'
select count(*) as second_claim from claim_extraction_jobs(5,'test-worker-2');

\echo '--- an abandoned job is reclaimed after 10 minutes — expect 1'
update extraction_jobs set locked_at = now() - interval '11 minutes';
select count(*) as reclaimed from claim_extraction_jobs(5,'test-worker-3');

-- ------------------------------------------------------------------ failure
\echo '--- fail once: back to QUEUED with backoff, not FAILED'
select fail_extraction((select id from extraction_jobs limit 1), 'provider timeout');
select status, attempts, last_error, run_after > now() as backed_off from extraction_jobs;

\echo '--- exhaust the attempts: FAILED, and the document says so'
update extraction_jobs set attempts = 3, run_after = now();
select fail_extraction((select id from extraction_jobs limit 1), 'provider down');
select j.status as job_status, d.ai_status as doc_status
  from extraction_jobs j join documents d on d.id = j.document_id;

-- ----------------------------------------------------------------- success
\echo '--- complete it: advisory columns filled, document status untouched'
update extraction_jobs set status='RUNNING', attempts=1;
select complete_extraction(
  (select id from extraction_jobs limit 1),
  '{"name_as_printed":"Ananya Sen","date_of_birth":"1996-04-12","id_number_last4":"9012"}'::jsonb,
  '[{"code":"NAME_MISMATCH","severity":"warning","message":"Name differs from the application"}]'::jsonb,
  0.93, 'gpt-5.6-luna');

select ai_status, ai_model, ai_legibility,
       ai_extracted->>'name_as_printed' as name_read,
       jsonb_array_length(ai_findings)  as findings,
       status                           as document_status_must_still_be_pending,
       verified_by is null              as never_verified_by_machine
  from documents where id='cccccccc-0000-0000-0000-000000000001';

\echo '--- the extraction was audited'
select event, entity_type from audit_events where event like 'ai:%' order by occurred_at;

-- --------------------------------------------------- the hard guarantee
\echo '--- a machine cannot mark a document VERIFIED (no verified_by) — must fail'
do $$ begin
  update documents set status='VERIFIED'
   where id='cccccccc-0000-0000-0000-000000000001';
  raise exception 'BUG: document was verified with nobody signing for it';
exception when check_violation then raise notice 'correctly rejected by constraint';
end $$;

\echo '--- nor REJECTED — must fail'
do $$ begin
  update documents set status='REJECTED', rejection_reason='illegible'
   where id='cccccccc-0000-0000-0000-000000000001';
  raise exception 'BUG: document was rejected with nobody signing for it';
exception when check_violation then raise notice 'correctly rejected by constraint';
end $$;

\echo '--- but a real officer still can, because review_document signs for it'
set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000002', false);
select status, verified_by is not null as signed
  from review_document('cccccccc-0000-0000-0000-000000000001','VERIFIED');

\echo '--- and the AI annotations survived the officer decision'
reset role;
select status, ai_status, ai_model from documents
 where id='cccccccc-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------- RLS
\echo '--- the applicant cannot read the queue — expect 0'
set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', false);
select count(*) as applicant_sees_jobs from extraction_jobs;

\echo '--- but does see the advisory result on their own document — expect 1'
select count(*) as applicant_sees_findings from documents
 where id='cccccccc-0000-0000-0000-000000000001' and ai_findings is not null;

\echo '--- a stranger sees neither — expect 0 and 0'
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000003', false);
select (select count(*) from extraction_jobs) as jobs,
       (select count(*) from documents)       as documents;

\echo '--- the officer handling the case does see the queue — expect 1'
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000002', false);
select count(*) as officer_sees_jobs from extraction_jobs;

\echo '--- health view respects RLS: stranger sees nothing'
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000003', false);
select count(*) as stranger_health_rows from extraction_health;
reset role;

-- ------------------------------------------------------------------- skip
\echo '--- a format the model cannot read is SKIPPED, not FAILED'
set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', false);
insert into documents (id, application_id, type, storage_path, mime_type, size_bytes)
values ('cccccccc-0000-0000-0000-000000000003','bbbbbbbb-0000-0000-0000-000000000001',
        'ADDRESS_PROOF','bbbbbbbb-0000-0000-0000-000000000001/addr.pdf','application/pdf',3000);
reset role;
select skip_extraction(
  (select id from extraction_jobs where document_id='cccccccc-0000-0000-0000-000000000003'),
  'application/pdf cannot be read by the vision model');

select j.status as job_status, d.ai_status as doc_status, j.last_error
  from extraction_jobs j join documents d on d.id = j.document_id
 where j.document_id='cccccccc-0000-0000-0000-000000000003';

\echo '--- a skipped job is not handed out again — expect 0'
select count(*) as claims_after_skip from claim_extraction_jobs(5,'test-worker');

\echo '--- and it was audited'
select event from audit_events where event='ai:skipped';
