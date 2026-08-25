insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333','stranger@example.com');
set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
\echo '--- a stranger querying every table (all must be 0)'
select
  (select count(*) from applications) as applications,
  (select count(*) from parties)      as parties,
  (select count(*) from documents)    as documents,
  (select count(*) from witnesses)    as witnesses,
  (select count(*) from audit_events) as audit;
\echo '--- stranger tries to read a profile that is not theirs (must be 0)'
select count(*) as other_profiles from profiles where id <> auth.uid();
\echo '--- stranger tries to escalate their own role (must stay APPLICANT)'
do $$ begin
  update profiles set role='RGM_ADMIN' where id = auth.uid();
  raise notice 'role after self-update attempt: %', (select role from profiles where id = auth.uid());
exception when others then raise notice 'blocked: %', sqlerrm; end $$;
\echo '--- stranger tries to insert an application owned by someone else (must fail)'
do $$ begin
  insert into applications (owner_id, act_code) values ('11111111-1111-1111-1111-111111111111','HMA_1955');
  raise exception 'BUG: inserted an application for another user';
exception when insufficient_privilege then raise notice 'correctly rejected by RLS';
          when others then raise notice 'correctly rejected: %', sqlerrm; end $$;
\echo '--- the owner still sees their own (must be 1)'
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
select count(*) as owner_sees from applications;
