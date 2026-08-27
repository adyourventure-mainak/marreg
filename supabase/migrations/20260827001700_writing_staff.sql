-- Separate the staff who may write from the staff who may only read.
--
-- is_staff() has meant "any role other than APPLICANT" since the first
-- migration. That is the right test for reading — an auditor is meant to see
-- every application in the office, and a support agent needs to read a case to
-- answer a question about it. It is the wrong test for writing, and it was the
-- only test being applied: AUDITOR and SUPPORT_READONLY could move an
-- application through the workflow, verify or reject a document, publish a
-- directory entry to the public, and assign Acts to an officer.
--
-- The two roles are named read-only in the role list and in the admin screen,
-- so the schema was contradicting what the interface promised.
--
-- The split here is deliberately narrow. is_staff() keeps its meaning and every
-- read keeps using it; only the write paths move to is_writing_staff(). The
-- four functions below are reproduced verbatim from the migrations that
-- created them, with the single guard line changed — they were spliced from
-- those files rather than retyped, so nothing else can have drifted.

create or replace function is_writing_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_user_role() not in ('APPLICANT','AUDITOR','SUPPORT_READONLY'), false)
$$;

comment on function is_writing_staff() is
  'Staff who may change records. Excludes the read-only roles AUDITOR and '
  'SUPPORT_READONLY, which is_staff() deliberately still includes for reads.';

-- Granted to anon like the other policy helpers: an anon caller attempting an
-- update must be refused by the policy, not by a permission error on the
-- function the policy calls.
revoke execute on function is_writing_staff() from public;
grant  execute on function is_writing_staff() to anon, authenticated;

-- ------------------------------------------------------------------ policies
-- Reads are untouched. Only the update paths change.

drop policy if exists applications_staff_update on applications;
create policy applications_staff_update on applications for update
  using (is_admin() or (is_writing_staff() and office_id = current_user_office()))
  with check (is_admin() or (is_writing_staff() and office_id = current_user_office()));

do $policies$ declare t text;
begin
  foreach t in array array['parties','witnesses','documents'] loop
    execute format('drop policy if exists %1$s_staff_write on %1$s', t);
    execute format('create policy %1$s_staff_write on %1$s for update using (is_writing_staff() and may_read_app(application_id)) with check (is_writing_staff() and may_read_app(application_id))', t);
  end loop;
end $policies$;

drop policy if exists objections_staff_update on objections;
create policy objections_staff_update on objections for update
  using (is_writing_staff()) with check (is_writing_staff());

-- ----------------------------------------------------------------- functions
create or replace function transition_application(p_app uuid, p_event text, p_reason text default null)
returns applications
language plpgsql security definer set search_path = public as $$
declare
  app applications;
  from_status application_status;
  to_status application_status;
begin
  if not is_writing_staff() then raise exception 'Your role is read-only and may not move an application'; end if;

  select * into app from applications where id = p_app for update;
  if not found then raise exception 'Application not found'; end if;

  if not is_admin() and app.office_id is distinct from current_user_office() then
    raise exception 'This application belongs to another office';
  end if;

  from_status := app.status;
  to_status := case from_status || '|' || p_event
    when 'SUBMITTED|officerAssigned'                  then 'UNDER_SCRUTINY'
    when 'UNDER_SCRUTINY|sendBackForCorrection'       then 'AWAITING_APPLICANT_FIX'
    when 'UNDER_SCRUTINY|reject'                      then 'CANCELLED'
    when 'UNDER_SCRUTINY|approveNotice'               then 'NOTICE_PUBLISHED'
    when 'AWAITING_APPLICANT_FIX|resubmit'            then 'UNDER_SCRUTINY'
    when 'NOTICE_PUBLISHED|objectionFiled'            then 'OBJECTION_UNDER_ENQUIRY'
    when 'NOTICE_PUBLISHED|objectionWindowClosed'     then 'AWAITING_REGISTRATION'
    when 'OBJECTION_UNDER_ENQUIRY|objectionUpheld'    then 'CANCELLED'
    when 'OBJECTION_UNDER_ENQUIRY|objectionDismissed' then 'AWAITING_REGISTRATION'
    when 'AWAITING_REGISTRATION|registered'           then 'REGISTERED'
    when 'AWAITING_REGISTRATION|deadlineLapsed'       then 'LAPSED'
    when 'REGISTERED|certificateIssued'               then 'CERTIFICATE_ISSUED'
    else null end::application_status;

  if to_status is null then
    raise exception 'Illegal transition: % + %', from_status, p_event;
  end if;

  update applications set
    status           = to_status,
    officer_note     = coalesce(p_reason, officer_note),
    cancelled_reason = case when to_status = 'CANCELLED' then p_reason else cancelled_reason end,
    registered_at    = case when to_status = 'REGISTERED' then now() else registered_at end,
    version          = app.version + 1
  where id = p_app
  returning * into app;

  perform log_audit(p_app, 'application', p_app::text, p_event,
                    jsonb_build_object('status', from_status),
                    jsonb_build_object('status', to_status, 'reason', p_reason));
  return app;
end $$;

create or replace function review_document(p_doc uuid, p_status document_status, p_reason text default null)
returns documents
language plpgsql security definer set search_path = public as $$
declare doc documents;
begin
  if not is_writing_staff() then raise exception 'Your role is read-only and may not decide documents'; end if;
  update documents set status = p_status, rejection_reason = p_reason,
         verified_by = auth.uid(), verified_at = now()
  where id = p_doc returning * into doc;
  if not found then raise exception 'Document not found'; end if;
  perform log_audit(doc.application_id, 'document', p_doc::text, 'document:'||p_status,
                    null, jsonb_build_object('status', p_status, 'reason', p_reason));
  return doc;
end $$;

create or replace function review_office(
  p_office uuid, p_status verification_status, p_note text default null)
returns offices
language plpgsql security definer set search_path = public as $$
declare office offices;
begin
  if auth.uid() is null then raise exception 'Sign in to review directory entries'; end if;
  if not is_writing_staff() then raise exception 'Your role is read-only and may not verify directory entries'; end if;
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

create or replace function set_office_acts(
  p_office uuid, p_acts act_code[], p_note text default null)
returns offices
language plpgsql security definer set search_path = public as $$
declare
  office offices;
  before act_code[];
begin
  if auth.uid() is null then raise exception 'Sign in to assign Acts'; end if;
  if not is_writing_staff() then raise exception 'Your role is read-only and may not assign Acts'; end if;

  -- An empty array is a legitimate state — it is what the import leaves behind
  -- and what a reviewer should see until they decide. A NULL is not: it would
  -- make `p_act = any(acts)` in search_offices() return NULL rather than false.
  if p_acts is null then raise exception 'Pass an array of Acts, empty if none apply'; end if;

  if exists (select 1 from unnest(p_acts) a group by a having count(*) > 1) then
    raise exception 'The same Act is listed twice';
  end if;

  select acts into before from offices where id = p_office;
  if not found then raise exception 'Directory entry not found'; end if;

  update offices
     set acts = p_acts, updated_at = now()
   where id = p_office
  returning * into office;

  perform log_audit(null, 'office', p_office::text, 'office:acts',
                    jsonb_build_object('acts', before),
                    jsonb_build_object('acts', p_acts, 'note', p_note));
  return office;
end $$;
-- ------------------------------------------------------------------- asserts
do $assert$
declare leftover text;
begin
  -- No write path may still be gated on is_staff().
  select string_agg(p.proname, ', ') into leftover
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('transition_application','review_document','review_office','set_office_acts')
    and pg_get_functiondef(p.oid) like '%not is_staff()%';
  if leftover is not null then
    raise exception 'still gated on is_staff(): %', leftover;
  end if;

  select string_agg(polname, ', ') into leftover
  from pg_policy
  where polname in ('applications_staff_update','objections_staff_update',
                    'parties_staff_write','witnesses_staff_write','documents_staff_write')
    and pg_get_expr(polqual, polrelid) not like '%is_writing_staff()%';
  if leftover is not null then
    raise exception 'policy not switched: %', leftover;
  end if;

  -- And the read path must NOT have moved.
  if pg_get_expr((select polqual from pg_policy where polname = 'offices_read'),
                 (select polrelid from pg_policy where polname = 'offices_read'))
     not like '%is_staff()%' then
    raise exception 'offices_read should still use is_staff()';
  end if;
end $assert$;
