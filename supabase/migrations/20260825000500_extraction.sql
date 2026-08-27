-- MARREG :: Layer 2 — document extraction queue
--
-- A vision model reads each uploaded document and returns structured fields.
-- Extraction is ADVISORY: it annotates documents, and can never verify or
-- reject one. That guarantee is structural, not conventional — see the
-- documents_verified_by_human constraint below.
--
-- The queue lives in Postgres so retries, backoff and failures are visible in
-- the same place as everything else, and so a worker crash cannot lose a job.

-- ------------------------------------------------------------------- status
do $$ begin
  create type extraction_status as enum ('QUEUED','RUNNING','DONE','FAILED','SKIPPED');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------- advisory columns
alter table documents add column if not exists ai_status     extraction_status;
alter table documents add column if not exists ai_extracted  jsonb;
alter table documents add column if not exists ai_findings   jsonb;
alter table documents add column if not exists ai_legibility real;
alter table documents add column if not exists ai_checked_at timestamptz;
alter table documents add column if not exists ai_model      text;

comment on column documents.ai_extracted is
  'Redacted structured fields read from the scan. Never contains a full ID number.';
comment on column documents.ai_findings is
  'Advisory findings, same shape as lib/preflight.ts Finding. Never a verification decision.';
comment on column documents.ai_model is
  'Provider/model that produced this row, so findings can be traced to a model version.';

-- ------------------------------------------------------- the hard guarantee
--
-- A document may only leave PENDING when a human has signed for it. The
-- extraction worker never sets verified_by, so it is structurally incapable of
-- marking a document VERIFIED or REJECTED, whatever the code does.
--
-- NOT VALID: existing rows are left alone; every future insert and update is
-- checked. review_document() already sets verified_by, so staff review is
-- unaffected.
do $$ begin
  alter table documents add constraint documents_verified_by_human
    check (status = 'PENDING' or verified_by is not null) not valid;
exception when duplicate_object then null; end $$;

-- --------------------------------------------------------------- the queue
create table if not exists extraction_jobs (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references documents(id) on delete cascade,
  application_id uuid not null references applications(id) on delete cascade,
  status         extraction_status not null default 'QUEUED',
  attempts       int not null default 0,
  max_attempts   int not null default 3,
  last_error     text,
  locked_at      timestamptz,
  locked_by      text,
  run_after      timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (document_id)
);

create index if not exists extraction_jobs_ready_idx
  on extraction_jobs (run_after)
  where status in ('QUEUED','RUNNING');

drop trigger if exists touch_extraction_jobs on extraction_jobs;
create trigger touch_extraction_jobs before update on extraction_jobs
  for each row execute function touch_updated_at();

-- ------------------------------------------------------------- enqueueing
--
-- Photographs and signatures carry no text worth extracting, so they are
-- recorded as SKIPPED rather than queued — cheaper, and it keeps the document
-- list honest about what was actually checked.
-- Set on the row being inserted, so no second write to documents is needed.
create or replace function mark_extraction_pending() returns trigger
language plpgsql set search_path = public as $$
begin
  new.ai_status := case when new.type in ('PHOTO','SIGNATURE_LTI')
                        then 'SKIPPED'::extraction_status
                        else 'QUEUED'::extraction_status end;
  return new;
end $$;

drop trigger if exists documents_mark_extraction on documents;
create trigger documents_mark_extraction before insert on documents
  for each row execute function mark_extraction_pending();

-- The job row can only be created once the document exists (FK).
create or replace function enqueue_extraction() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.ai_status = 'SKIPPED' then return new; end if;

  insert into extraction_jobs (document_id, application_id)
  values (new.id, new.application_id)
  on conflict (document_id) do update
    set status = 'QUEUED', attempts = 0, last_error = null,
        locked_at = null, locked_by = null, run_after = now();

  return new;
end $$;

drop trigger if exists documents_enqueue_extraction on documents;
create trigger documents_enqueue_extraction after insert on documents
  for each row execute function enqueue_extraction();

-- --------------------------------------------------------------- claiming
--
-- SKIP LOCKED lets several workers run at once without handing the same job
-- out twice. A RUNNING job whose lock is older than 10 minutes is treated as
-- abandoned and reclaimed, so a worker that dies mid-job does not strand it.
create or replace function claim_extraction_jobs(p_limit int default 5, p_worker text default 'worker')
returns table (
  job_id         uuid,
  document_id    uuid,
  application_id uuid,
  document_type  document_type,
  storage_path   text,
  mime_type      text,
  attempts       int
)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with claimed as (
    select j.id
    from extraction_jobs j
    where j.run_after <= now()
      and (j.status = 'QUEUED'
           or (j.status = 'RUNNING' and j.locked_at < now() - interval '10 minutes'))
    order by j.run_after
    limit greatest(1, least(p_limit, 25))
    for update skip locked
  )
  update extraction_jobs j
     set status = 'RUNNING', locked_at = now(), locked_by = p_worker,
         attempts = j.attempts + 1
    from claimed c, documents d
   where j.id = c.id and d.id = j.document_id
  returning j.id, d.id, j.application_id, d.type, d.storage_path, d.mime_type, j.attempts;
end $$;

-- --------------------------------------------------------------- finishing
create or replace function complete_extraction(
  p_job uuid,
  p_extracted jsonb,
  p_findings jsonb default '[]'::jsonb,
  p_legibility real default null,
  p_model text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare j extraction_jobs;
begin
  select * into j from extraction_jobs where id = p_job;
  if not found then raise exception 'Extraction job not found'; end if;

  -- Note what is absent: status, verified_by, verified_at. Extraction annotates
  -- a document; it never decides one.
  update documents
     set ai_extracted  = p_extracted,
         ai_findings   = coalesce(p_findings, '[]'::jsonb),
         ai_legibility = p_legibility,
         ai_model      = p_model,
         ai_checked_at = now(),
         ai_status     = 'DONE'
   where id = j.document_id;

  update extraction_jobs
     set status = 'DONE', last_error = null, locked_at = null, locked_by = null
   where id = p_job;

  perform log_audit(j.application_id, 'document', j.document_id::text, 'ai:extracted',
                    null, jsonb_build_object('model', p_model, 'legibility', p_legibility,
                                             'findings', coalesce(p_findings, '[]'::jsonb)));
end $$;

-- Not every document can be read by an image model — a PDF is the common case.
-- Those are SKIPPED, not FAILED: nothing is wrong with the document, and
-- retrying it three times would only fill the queue with noise.
create or replace function skip_extraction(p_job uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare j extraction_jobs;
begin
  select * into j from extraction_jobs where id = p_job;
  if not found then raise exception 'Extraction job not found'; end if;

  update extraction_jobs
     set status = 'SKIPPED', last_error = p_reason, locked_at = null, locked_by = null
   where id = p_job;

  update documents set ai_status = 'SKIPPED' where id = j.document_id;

  perform log_audit(j.application_id, 'document', j.document_id::text, 'ai:skipped',
                    null, jsonb_build_object('reason', p_reason));
end $$;

create or replace function fail_extraction(p_job uuid, p_error text)
returns void
language plpgsql security definer set search_path = public as $$
declare j extraction_jobs; give_up boolean;
begin
  select * into j from extraction_jobs where id = p_job;
  if not found then raise exception 'Extraction job not found'; end if;

  give_up := j.attempts >= j.max_attempts;

  update extraction_jobs
     set status     = case when give_up then 'FAILED'::extraction_status
                                        else 'QUEUED'::extraction_status end,
         last_error = p_error,
         locked_at  = null,
         locked_by  = null,
         -- 1 min, 3 min, 9 min …
         run_after  = now() + (interval '1 minute' * power(3, j.attempts))
   where id = p_job;

  if give_up then
    update documents set ai_status = 'FAILED' where id = j.document_id;
    perform log_audit(j.application_id, 'document', j.document_id::text, 'ai:failed',
                      null, jsonb_build_object('error', p_error, 'attempts', j.attempts));
  end if;
end $$;

-- ------------------------------------------------------------------- RLS
alter table extraction_jobs enable row level security;

-- Applicants have no business reading the queue; they see the outcome on the
-- document row itself, which the existing documents policies already cover.
drop policy if exists extraction_jobs_staff_read on extraction_jobs;
create policy extraction_jobs_staff_read on extraction_jobs for select
  using (is_staff() and may_read_app(application_id));

-- No insert/update/delete policy: the queue is written only by the trigger and
-- by the SECURITY DEFINER functions above, and read by the worker's service
-- role, which bypasses RLS entirely.

grant select on extraction_jobs to authenticated;

-- ------------------------------------------------------- operational view
-- What a human should look at when asking "is extraction healthy?"
--
-- security_invoker: the view runs with the caller's rights, so the RLS policy
-- above applies and a non-staff user sees an empty result rather than a count
-- of everyone's documents.
create or replace view extraction_health
  with (security_invoker = true) as
  select status,
         count(*)                                        as jobs,
         max(attempts)                                   as worst_attempts,
         min(run_after) filter (where status = 'QUEUED') as next_due,
         max(updated_at)                                 as last_activity
    from extraction_jobs
   group by status;

grant select on extraction_health to authenticated;
