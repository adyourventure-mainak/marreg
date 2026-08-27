-- Function execute privileges, and one fail-open ownership guard.
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default. Every
-- `grant execute ... to authenticated` in the earlier migrations added a
-- privilege but never removed that default, so every one of this app's
-- functions in `public` was callable by `anon`. Combined with SECURITY DEFINER (which bypasses RLS)
-- that made the extraction worker's queue functions and the applicant RPCs
-- reachable without signing in.
--
-- Exploiting the worst of them needs a valid application UUID, which is not
-- guessable, so this was not a live breach. It is still the wrong default.
--
-- The grant lists below are exhaustive over this app's own functions.
-- Anything not listed is reachable only by the table owner and service_role:
-- log_audit, next_application_number, years_between (called from inside
-- SECURITY DEFINER bodies, which run as the definer), and handle_new_user,
-- touch_updated_at, enqueue_extraction, mark_extraction_pending (trigger
-- functions — Postgres checks EXECUTE when the trigger is created, not when
-- it fires, so revoking here does not break them).

create or replace function submit_application(p_app uuid)
returns applications
language plpgsql security definer set search_path = public as $$
declare
  app applications;
  rule record;
  party_count int;
  rejected_docs int;
  parties_missing_docs int;
  witness_count int;
  incomplete_witnesses int;
  under_age int;
  reference date;
  earliest date;
  base date;
begin
  select * into app from applications where id = p_app for update;
  if not found then raise exception 'Application not found'; end if;
  -- auth.uid() is NULL for an unauthenticated caller, and `owner_id <> NULL`
  -- evaluates to NULL, which an IF treats as false. Without this line the
  -- ownership guard below silently passes for anon.
  if auth.uid() is null then raise exception 'Sign in to submit an application'; end if;
  if app.owner_id <> auth.uid() then raise exception 'Not your application'; end if;
  if app.status not in ('DRAFT','AWAITING_APPLICANT_FIX') then
    raise exception 'Application is already submitted';
  end if;

  select * into rule from act_rule(app.act_code);

  -- completeness gates
  select count(*) into party_count from parties where application_id = p_app;
  if party_count < 2 then raise exception 'Both applicants must be filled in before submitting'; end if;
  if app.office_id is null then raise exception 'Choose a Marriage Officer before submitting'; end if;

  -- documents: identity and age proof for each applicant, attributed to them
  select count(*) into parties_missing_docs
  from parties p
  where p.application_id = p_app
    and not (
      exists (select 1 from documents d
              where d.application_id = p_app and d.owner_party_id = p.id
                and d.type = 'IDENTITY_PROOF' and d.status <> 'REJECTED')
      and exists (select 1 from documents d
                  where d.application_id = p_app and d.owner_party_id = p.id
                    and d.type = 'AGE_PROOF' and d.status <> 'REJECTED')
    );
  if parties_missing_docs > 0 then
    raise exception 'Each applicant needs their own identity proof and age proof';
  end if;

  -- nothing the officer has already rejected may be resubmitted as-is
  select count(*) into rejected_docs
  from documents where application_id = p_app and status = 'REJECTED';
  if rejected_docs > 0 then
    raise exception 'Replace the % document(s) the officer rejected before resubmitting', rejected_docs;
  end if;

  -- witnesses: the right number, each one actually identifiable
  select count(*) into witness_count from witnesses where application_id = p_app;
  if witness_count <> rule.required_witnesses then
    raise exception 'This Act requires exactly % witnesses; % have been entered',
      rule.required_witnesses, witness_count;
  end if;

  select count(*) into incomplete_witnesses from witnesses
  where application_id = p_app
    and (coalesce(trim(name),'') = ''
      or coalesce(trim(address),'') = ''
      or coalesce(trim(id_type),'') = ''
      or coalesce(trim(id_last_four),'') = '');
  if incomplete_witnesses > 0 then
    raise exception 'Every witness needs a name, an address, and a photo ID; % are incomplete',
      incomplete_witnesses;
  end if;

  -- age: measured on the marriage date where there is one, else today, which
  -- is what validateEligibility() in lib/acts.ts does.
  reference := coalesce(app.marriage_date, current_date);
  select count(*) into under_age from parties
  where application_id = p_app
    and date_of_birth is not null
    and years_between(date_of_birth, reference) < rule.minimum_age;
  if under_age > 0 then
    raise exception 'Both applicants must be at least % years old under this Act', rule.minimum_age;
  end if;

  -- an Act that registers an existing marriage may impose a waiting period
  if rule.already_solemnised then
    if app.marriage_date is null then
      raise exception 'Enter the date the marriage took place';
    end if;
    if app.marriage_date > current_date then
      raise exception 'Under this Act the marriage must already have taken place';
    end if;
    if rule.minimum_days_after_marriage is not null then
      earliest := app.marriage_date + rule.minimum_days_after_marriage;
      if earliest > current_date then
        raise exception 'Under this Act you may apply from % — % days after the marriage',
          earliest, rule.minimum_days_after_marriage;
      end if;
    end if;
  end if;

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

-- ------------------------------------------------------------ reset
-- Strips the PUBLIC default and any anon grant in one statement, so a function
-- added later cannot inherit the old hole by being forgotten here. Extension
-- functions (pg_trgm) are owned by the extension, not by us, so REVOKE skips
-- them and trigram office search is unaffected — verified after applying.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from authenticated;

-- --------------------------------------------------- policy helpers
-- Referenced inside RLS policy expressions, which are evaluated as the
-- querying role — anon included, because the offices and fee_schedule
-- policies are readable without signing in. Revoking these would break
-- the public office search rather than secure it.
grant execute on function can_view_application(applications) to anon, authenticated;
grant execute on function current_user_office()      to anon, authenticated;
grant execute on function current_user_role()        to anon, authenticated;
grant execute on function is_admin()                 to anon, authenticated;
grant execute on function is_staff()                 to anon, authenticated;
grant execute on function may_edit_app(uuid)         to anon, authenticated;
grant execute on function may_read_app(uuid)         to anon, authenticated;

-- ------------------------------------------------- public endpoints
-- Deliberately reachable without an account: tracking a case by number,
-- finding an office, filing an objection, reading the Act rules.
grant execute on function act_rule(act_code)                          to anon, authenticated;
grant execute on function file_objection(text, text, text, text)      to anon, authenticated;
grant execute on function search_offices(text, text, act_code)        to anon, authenticated;
grant execute on function track_application(text, date)               to anon, authenticated;

-- ------------------------------------------------ signed-in actions
grant execute on function submit_application(uuid)                    to authenticated;
grant execute on function transition_application(uuid, text, text)    to authenticated;
grant execute on function review_document(uuid, document_status, text) to authenticated;

-- ---------------------------------------------- extraction worker
-- Called only by the /api/extraction route using the service role key.
-- No browser-facing role should reach these.
grant execute on function claim_extraction_jobs(int, text) to service_role;
grant execute on function complete_extraction(uuid, jsonb, jsonb, real, text) to service_role;
grant execute on function fail_extraction(uuid, text)      to service_role;
grant execute on function skip_extraction(uuid, text)      to service_role;

-- --------------------------------------------------------- assert
-- Fail the migration rather than report success on a half-applied state.
do $assert$
declare leaked text;
begin
  select string_agg(p.proname, ', ') into leaked
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    and p.proname in ('submit_application','transition_application','review_document',
                      'claim_extraction_jobs','complete_extraction','fail_extraction',
                      'skip_extraction','enqueue_extraction','mark_extraction_pending',
                      'handle_new_user','log_audit','next_application_number');
  if leaked is not null then
    raise exception 'anon can still execute: %', leaked;
  end if;
end $assert$;
