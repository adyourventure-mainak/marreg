-- MARREG :: witness rules, and the submit gates that were missing
--
-- Two problems this closes.
--
-- 1. The witness count lived only in the server action (`rows.length < 2`),
--    which is a form validation, not a rule. submit_application() had no
--    witness check of any kind, so an application could be submitted with one
--    witness, or none, by any client that did not go through the wizard.
--
-- 2. `minimum_age` and `minimum_days_after_marriage` existed in act_rules and
--    in lib/acts.ts, but nothing in the database enforced them. They were
--    advisory: a client that skipped validateEligibility() could submit an
--    under-age application and the registry would accept it.
--
-- The witness count becomes a column on act_rules rather than a constant,
-- because it is a statutory quantity like any other and it may differ by Act.

-- ---------------------------------------------------------------- the rule
alter table act_rules
  add column if not exists required_witnesses int not null default 3
    check (required_witnesses between 2 and 4);

comment on column act_rules.required_witnesses is
  'Witnesses required before an application may be submitted. Seeded to 3 for '
  'every Act as the West Bengal registration requirement. UNCONFIRMED for '
  'PMDA_1936: the Parsi Marriage and Divorce Act, 1936 speaks of two Parsi '
  'witnesses at solemnisation. If registration under that Act in fact requires '
  'two rather than three, correct it here with a single UPDATE — that is why '
  'this is a column and not a constant.';

update act_rules set required_witnesses = 3, updated_at = now();

-- --------------------------------------------------------- age helper
-- Postgres has no "age in whole years on a date" built in that reads clearly
-- at the call site, and the rule must match lib/acts.ts exactly: whole years
-- completed on the reference date.
create or replace function years_between(p_from date, p_to date)
returns int language sql immutable as $$
  select extract(year from age(p_to, p_from))::int
$$;

-- --------------------------------------------------------- submit gates
create or replace function submit_application(p_app uuid)
returns applications
language plpgsql security definer set search_path = public as $$
declare
  app applications;
  rule record;
  party_count int;
  doc_count int;
  witness_count int;
  incomplete_witnesses int;
  under_age int;
  reference date;
  earliest date;
  base date;
begin
  select * into app from applications where id = p_app for update;
  if not found then raise exception 'Application not found'; end if;
  if app.owner_id <> auth.uid() then raise exception 'Not your application'; end if;
  if app.status not in ('DRAFT','AWAITING_APPLICANT_FIX') then
    raise exception 'Application is already submitted';
  end if;

  select * into rule from act_rule(app.act_code);

  -- completeness gates
  select count(*) into party_count from parties where application_id = p_app;
  if party_count < 2 then raise exception 'Both applicants must be filled in before submitting'; end if;
  if app.office_id is null then raise exception 'Choose a Marriage Officer before submitting'; end if;

  select count(*) into doc_count from documents where application_id = p_app and type in ('IDENTITY_PROOF','AGE_PROOF');
  if doc_count < 1 then raise exception 'Upload at least one identity or age proof before submitting'; end if;

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
