-- A bare string literal appended to a text[] is ambiguous: Postgres resolves
-- `array || unknown` as array_cat and tries to parse the sentence as an array
-- literal, so validating a notice Act on an application that carries a
-- marriage date raised "malformed array literal" instead of returning advice.
-- The format() calls nearby were unaffected because their result is typed
-- text. Casting the three literals settles the operator.

create or replace function validate_act_choice(p_app uuid, p_act act_code)
returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
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
      problems := problems || 'This Act registers a marriage that has already taken place — enter the date of the marriage'::text;
    elsif app.marriage_date > current_date then
      problems := problems || 'This Act requires that the marriage has already taken place'::text;
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
      notes := notes || 'This Act gives notice of an intended marriage. The marriage date already entered will not be used.'::text;
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
end $fn$;

revoke execute on function validate_act_choice(uuid, act_code) from public, anon;
grant  execute on function validate_act_choice(uuid, act_code) to authenticated;

do $assert$
begin
  if has_function_privilege('anon', 'public.validate_act_choice(uuid, act_code)', 'execute') then
    raise exception 'validate_act_choice is still anon-executable';
  end if;
end $assert$;
