-- Act selection, scrutiny, and correction.
--
-- The workflow this supports:
--   applicant selects an Act -> the assistant explains suitability ->
--   deterministic rules validate -> applicant confirms -> officer scrutinises ->
--   if wrong, sent back with a reason -> applicant confirms a corrected Act ->
--   the legal timeline is recalculated and stored.
--
-- Two rules shape everything below.
--
-- First, the assistant never decides. Its explanation is stored in act_advice
-- as prose attached to an application, and nothing reads it back to make a
-- decision. The gate is validate_act_choice(), which is ordinary SQL over
-- act_rules. An applicant may confirm an Act the assistant argued against, and
-- may not confirm one the rules reject — the advice has no vote either way.
--
-- Second, a timeline belongs to the Act it was computed under. When the Act
-- changes, the old dates are not adjusted or carried over; they are discarded
-- and recomputed from the day the correction is confirmed. That can only ever
-- move a statutory period later, never shorten one, which is the safe
-- direction to be wrong in.

-- --------------------------------------------------------------- advice log
-- Advisory prose, kept for the audit trail: if an applicant later says they
-- chose an Act because the system told them to, the department can read back
-- exactly what it said, and under which prompt and model.
create table if not exists act_advice (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  act_code       act_code not null,
  question       text,
  advice         text not null,
  model          text,
  prompt_version text,
  created_at     timestamptz not null default now()
);
create index if not exists act_advice_app_idx on act_advice (application_id, created_at desc);

comment on table act_advice is
  'Assistant explanations of Act suitability. Advisory only: no function reads '
  'this table to decide anything. validate_act_choice() is the gate.';

-- ------------------------------------------------------------ change ledger
-- Every confirmed selection lands here, including the first one, so the
-- history reads as a complete sequence rather than a set of amendments to an
-- invisible original. Timelines are captured on both sides because the dates
-- on `applications` are overwritten in place.
create table if not exists act_selections (
  id               uuid primary key default gen_random_uuid(),
  application_id   uuid not null references applications(id) on delete cascade,
  from_act         act_code,
  to_act           act_code not null,
  selected_by      uuid references auth.users(id),
  selected_role    text not null,
  reason           text,
  advice_id        uuid references act_advice(id),
  timeline_before  jsonb,
  timeline_after   jsonb,
  created_at       timestamptz not null default now()
);
create index if not exists act_selections_app_idx on act_selections (application_id, created_at desc);

-- The officer's send-back reason lives on the application so the applicant's
-- correction screen can show it without walking the ledger.
alter table applications
  add column if not exists act_query_reason text,
  add column if not exists act_confirmed_at timestamptz;

comment on column applications.act_query_reason is
  'Why the scrutinising officer disputed the chosen Act. Cleared when the '
  'applicant confirms a corrected Act.';

-- ------------------------------------------------------------- the validator
-- Reports rather than raises. The selection screen needs to show every problem
-- with a candidate Act while the applicant is still choosing, and an exception
-- would surface one problem at a time and abort the transaction doing it.
-- submit_application() keeps its own raising checks: this is the same statute
-- read early, not a replacement for the gate at submission.
create or replace function validate_act_choice(p_app uuid, p_act act_code)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  app        applications;
  rule       act_rules;
  problems   text[] := '{}';
  notes      text[] := '{}';
  reference  date;
  under_age  int;
  earliest   date;
begin
  if auth.uid() is null then raise exception 'Sign in to check an Act'; end if;

  select * into app from applications where id = p_app;
  if not found then raise exception 'Application not found'; end if;
  if not (may_read_app(p_app) or is_staff()) then
    raise exception 'You may not read this application';
  end if;

  select * into rule from act_rules where code = p_act;
  if not found then raise exception 'No rule on record for %', p_act; end if;

  reference := coalesce(app.marriage_date, current_date);

  select count(*) into under_age from parties
  where application_id = p_app
    and date_of_birth is not null
    and years_between(date_of_birth, reference) < rule.minimum_age;
  if under_age > 0 then
    problems := problems || format(
      'Both applicants must be at least %s years old under this Act', rule.minimum_age);
  end if;

  if rule.already_solemnised then
    if app.marriage_date is null then
      problems := problems || 'This Act registers a marriage that has already taken place — enter the date of the marriage';
    elsif app.marriage_date > current_date then
      problems := problems || 'This Act requires that the marriage has already taken place';
    elsif rule.minimum_days_after_marriage is not null then
      earliest := app.marriage_date + rule.minimum_days_after_marriage;
      if earliest > current_date then
        problems := problems || format(
          'Under this Act you may apply from %s — %s days after the marriage',
          earliest, rule.minimum_days_after_marriage);
      end if;
    end if;
  else
    -- Not a defect: a notice Act simply does not use a marriage date, and the
    -- applicant should be told the field will be ignored rather than left
    -- wondering whether it was lost.
    if app.marriage_date is not null then
      notes := notes || 'This Act gives notice of an intended marriage. The marriage date already entered will not be used.';
    end if;
    if rule.notice_days is not null then
      notes := notes || format('A public notice runs for %s days before registration.', rule.notice_days);
    end if;
  end if;

  notes := notes || format('%s witnesses are required.', rule.required_witnesses);
  notes := notes || format('Objections may be filed for %s days.', rule.objection_days);
  notes := notes || format('Registration must be completed within %s months.', rule.deadline_months);

  return jsonb_build_object(
    'act',      p_act,
    'ok',       cardinality(problems) = 0,
    'problems', to_jsonb(problems),
    'notes',    to_jsonb(notes),
    'rule',     to_jsonb(rule));
end $$;

comment on function validate_act_choice(uuid, act_code) is
  'Deterministic suitability check. Returns {ok, problems[], notes[], rule}. '
  'Never consults act_advice.';

-- ------------------------------------------------------- timeline recompute
-- Only meaningful once an application has been submitted, because before that
-- there is no receipt date to recompute. Mirrors the arithmetic in
-- submit_application(): if that changes, this changes with it.
create or replace function recompute_act_timeline(p_app uuid)
returns applications
language plpgsql security definer set search_path = public as $$
declare
  app  applications;
  rule act_rules;
  base date;
begin
  select * into app from applications where id = p_app for update;
  if not found then raise exception 'Application not found'; end if;

  select * into rule from act_rules where code = app.act_code;
  if not found then raise exception 'No rule on record for %', app.act_code; end if;

  -- Never submitted: there is nothing to recompute, and inventing a receipt
  -- date here would hand the application a statutory clock it has not earned.
  if app.receipt_date is null then return app; end if;

  base := current_date;
  update applications set
    receipt_date             = base,
    objection_window_ends_at = base + (rule.objection_days || ' days')::interval,
    registration_deadline_at = base + (rule.deadline_months || ' months')::interval,
    version                  = app.version + 1
  where id = p_app
  returning * into app;

  return app;
end $$;

-- ------------------------------------------------------------ the applicant
create or replace function confirm_act_selection(
  p_app uuid, p_act act_code, p_advice uuid default null, p_reason text default null)
returns applications
language plpgsql security definer set search_path = public as $$
declare
  app      applications;
  before   applications;
  check_   jsonb;
  timeline jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to choose an Act'; end if;

  select * into app from applications where id = p_app for update;
  if not found then raise exception 'Application not found'; end if;
  if app.owner_id <> auth.uid() then
    raise exception 'This application belongs to another account';
  end if;

  -- Once the notice is published the Act is public: the objection window that
  -- strangers are relying on was opened under it, and changing it silently
  -- would invalidate every objection already filed. A change from here has to
  -- go back through the office and be re-noticed.
  if app.status not in ('DRAFT', 'AWAITING_APPLICANT_FIX') then
    raise exception 'The Act cannot be changed once the application is with the office (status %)', app.status;
  end if;

  check_ := validate_act_choice(p_app, p_act);
  if not (check_->>'ok')::boolean then
    raise exception 'This Act does not fit the application: %',
      array_to_string(array(select jsonb_array_elements_text(check_->'problems')), '; ');
  end if;

  before   := app;
  timeline := jsonb_build_object(
    'act', app.act_code, 'receipt_date', app.receipt_date,
    'objection_window_ends_at', app.objection_window_ends_at,
    'registration_deadline_at', app.registration_deadline_at);

  update applications set
    act_code         = p_act,
    act_confirmed_at = now(),
    act_query_reason = null,
    version          = app.version + 1
  where id = p_app
  returning * into app;

  -- A submitted application that comes back for correction keeps its number
  -- but starts its statutory periods again under the new Act.
  if app.receipt_date is not null and before.act_code is distinct from p_act then
    app := recompute_act_timeline(p_app);
  end if;

  insert into act_selections (application_id, from_act, to_act, selected_by,
                              selected_role, reason, advice_id,
                              timeline_before, timeline_after)
  values (p_app,
          case when before.act_code = p_act then null else before.act_code end,
          p_act, auth.uid(), 'APPLICANT', p_reason, p_advice, timeline,
          jsonb_build_object(
            'act', app.act_code, 'receipt_date', app.receipt_date,
            'objection_window_ends_at', app.objection_window_ends_at,
            'registration_deadline_at', app.registration_deadline_at));

  perform log_audit(p_app, 'application', p_app::text, 'actConfirmed',
                    jsonb_build_object('act', before.act_code),
                    jsonb_build_object('act', app.act_code));
  return app;
end $$;

-- -------------------------------------------------------------- the officer
-- Scrutiny disputes the Act. The state change goes through
-- transition_application() rather than a second UPDATE, so there is still only
-- one state machine and its staff and office checks apply here unchanged.
create or replace function query_act_selection(p_app uuid, p_reason text)
returns applications
language plpgsql security definer set search_path = public as $$
declare app applications;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Give the applicant a reason the Act is wrong';
  end if;

  app := transition_application(p_app, 'sendBackForCorrection', p_reason);

  update applications set act_query_reason = btrim(p_reason)
  where id = p_app returning * into app;

  perform log_audit(p_app, 'application', p_app::text, 'actQueried',
                    jsonb_build_object('act', app.act_code),
                    jsonb_build_object('reason', btrim(p_reason)));
  return app;
end $$;

-- ---------------------------------------------------------------------- RLS
alter table act_advice     enable row level security;
alter table act_selections enable row level security;

-- Readable by the applicant and by staff; written only through the functions
-- above, which is why there is no insert policy on either table.
drop policy if exists act_advice_read on act_advice;
create policy act_advice_read on act_advice for select
  using (may_read_app(application_id) or is_staff());
drop policy if exists act_selections_read on act_selections;
create policy act_selections_read on act_selections for select
  using (may_read_app(application_id) or is_staff());

revoke execute on function validate_act_choice(uuid, act_code)   from public;
revoke execute on function confirm_act_selection(uuid, act_code, uuid, text) from public;
revoke execute on function query_act_selection(uuid, text)       from public;
revoke execute on function recompute_act_timeline(uuid)          from public;

grant execute on function validate_act_choice(uuid, act_code) to authenticated;
grant execute on function confirm_act_selection(uuid, act_code, uuid, text) to authenticated;
grant execute on function query_act_selection(uuid, text) to authenticated;
-- recompute_act_timeline is deliberately not granted: it rewrites statutory
-- dates with no authorisation check of its own and is only ever reached from
-- confirm_act_selection(), which has already established who the caller is.
