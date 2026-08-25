-- MARREG :: server-side business rules
-- These run as SECURITY DEFINER so the state machine and audit trail cannot be
-- bypassed by a client writing directly to the tables.

-- act rule table, mirrored from lib/acts.ts
create or replace function act_rule(a act_code)
returns table (objection_days int, notice_days int, deadline_months int, already_solemnised boolean)
language sql immutable as $$
  select t.objection_days, t.notice_days, t.deadline_months, t.already_solemnised
  from (values
    ('HMA_1955'::act_code,  7, null::int, 6, true),
    ('SMA_13',             30, 30,        3, false),
    ('SMA_16',             30, null,      6, true),
    ('ICMA_1872',          30, 30,        6, false),
    ('PMDA_1936',          30, null,      6, true)
  ) as t(code, objection_days, notice_days, deadline_months, already_solemnised)
  where t.code = a
$$;

-- ------------------------------------------------------------- audit helper
create or replace function log_audit(
  p_app uuid, p_entity text, p_entity_id text, p_event text,
  p_before jsonb default null, p_after jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into audit_events (application_id, entity_type, entity_id, event, actor_id, actor_role, before, after)
  values (p_app, p_entity, p_entity_id, p_event, auth.uid(), current_user_role(), p_before, p_after);
end $$;

-- ------------------------------------------------------------- submit
create or replace function submit_application(p_app uuid)
returns applications
language plpgsql security definer set search_path = public as $$
declare
  app applications;
  rule record;
  party_count int;
  doc_count int;
  base date;
begin
  select * into app from applications where id = p_app for update;
  if not found then raise exception 'Application not found'; end if;
  if app.owner_id <> auth.uid() then raise exception 'Not your application'; end if;
  if app.status not in ('DRAFT','AWAITING_APPLICANT_FIX') then
    raise exception 'Application is already submitted';
  end if;

  -- completeness gates
  select count(*) into party_count from parties where application_id = p_app;
  if party_count < 2 then raise exception 'Both applicants must be filled in before submitting'; end if;
  if app.office_id is null then raise exception 'Choose a Marriage Officer before submitting'; end if;

  select count(*) into doc_count from documents where application_id = p_app and type in ('IDENTITY_PROOF','AGE_PROOF');
  if doc_count < 1 then raise exception 'Upload at least one identity or age proof before submitting'; end if;

  select * into rule from act_rule(app.act_code);

  base := current_date;
  update applications set
    application_number      = coalesce(application_number, next_application_number()),
    status                  = 'SUBMITTED',
    submitted_at            = now(),
    receipt_date            = base,
    objection_window_ends_at = base + (rule.objection_days || ' days')::interval,
    registration_deadline_at = base + (rule.deadline_months || ' months')::interval,
    current_step            = 5,
    version                 = app.version + 1
  where id = p_app
  returning * into app;

  perform log_audit(p_app, 'application', p_app::text, 'submitted',
                    jsonb_build_object('status', 'DRAFT'),
                    jsonb_build_object('status','SUBMITTED','number',app.application_number));
  return app;
end $$;

-- ------------------------------------------------------------- state machine
create or replace function transition_application(p_app uuid, p_event text, p_reason text default null)
returns applications
language plpgsql security definer set search_path = public as $$
declare
  app applications;
  from_status application_status;
  to_status application_status;
begin
  if not is_staff() then raise exception 'Only registry staff may move an application'; end if;

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

-- ------------------------------------------------------------- document review
create or replace function review_document(p_doc uuid, p_status document_status, p_reason text default null)
returns documents
language plpgsql security definer set search_path = public as $$
declare doc documents;
begin
  if not is_staff() then raise exception 'Only registry staff may verify documents'; end if;
  update documents set status = p_status, rejection_reason = p_reason,
         verified_by = auth.uid(), verified_at = now()
  where id = p_doc returning * into doc;
  if not found then raise exception 'Document not found'; end if;
  perform log_audit(doc.application_id, 'document', p_doc::text, 'document:'||p_status,
                    null, jsonb_build_object('status', p_status, 'reason', p_reason));
  return doc;
end $$;

-- ------------------------------------------------------------- public status lookup
-- lets an applicant track a case with number + date of birth, without logging in.
create or replace function track_application(p_number text, p_dob date)
returns table (
  application_number text, status application_status, act_code act_code,
  submitted_at timestamptz, objection_window_ends_at date,
  registration_deadline_at date, office_name text, officer_note text, updated_at timestamptz)
language sql security definer set search_path = public as $$
  select a.application_number, a.status, a.act_code, a.submitted_at,
         a.objection_window_ends_at, a.registration_deadline_at,
         o.name, a.officer_note, a.updated_at
  from applications a
  left join offices o on o.id = a.office_id
  where a.application_number = upper(trim(p_number))
    and exists (select 1 from parties p where p.application_id = a.id and p.date_of_birth = p_dob)
  limit 1
$$;

grant execute on function track_application(text, date) to anon, authenticated;
grant execute on function submit_application(uuid) to authenticated;
grant execute on function transition_application(uuid, text, text) to authenticated;
grant execute on function review_document(uuid, document_status, text) to authenticated;

-- ------------------------------------------------------------- office search
create or replace function search_offices(p_query text default null, p_district text default null, p_act act_code default null)
returns setof offices
language sql stable as $$
  select * from offices
  where is_functional
    and (p_district is null or district_code = p_district)
    and (p_act is null or p_act = any(acts))
    and (p_query is null or p_query = '' or
         (coalesce(name,'')||' '||coalesce(officer_name,'')||' '||coalesce(police_station,'')||' '||
          coalesce(address,'')||' '||coalesce(pincode,'')) ilike '%'||p_query||'%')
  order by district_code, name
  limit 200
$$;
grant execute on function search_offices(text, text, act_code) to anon, authenticated;
