-- submit_application referenced rule.required_witnesses, but `rule` was
-- populated from act_rule(), whose returns-table has only four columns and
-- never gained required_witnesses when 20260825000800 introduced it. Every
-- submission that got past the document gates raised
-- 'record "rule" has no field "required_witnesses"'.

create or replace function submit_application(p_app uuid)
returns applications
language plpgsql security definer set search_path = public as $fn$
declare
  app applications;
  rule act_rules;
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

  -- Read every rule from act_rules, the table the registry maintains.
  -- act_rule() carries a hardcoded list that never gained
  -- required_witnesses when 20260825000800 added it, so reading the
  -- rule from there left this function referencing a field its record
  -- did not have and submission raised for every application.
  select * into rule from act_rules where code = app.act_code;
  if not found then raise exception 'No rule on record for %', app.act_code; end if;

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
end $fn$;

revoke execute on function submit_application(uuid) from public, anon;
grant  execute on function submit_application(uuid) to authenticated;

do $assert$
begin
  if has_function_privilege('anon', 'public.submit_application(uuid)', 'execute') then
    raise exception 'submit_application is still anon-executable';
  end if;
end $assert$;
