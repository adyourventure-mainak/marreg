-- Close the anon EXECUTE grants on the functions added by 1300 and 1400.
--
-- Migration 1000 revoked PUBLIC EXECUTE across the schema and re-granted
-- deliberately. That fixed the functions existing at the time, but it could not
-- fix the cause: this project carries
--
--   alter default privileges in schema public
--     grant execute on functions to anon, authenticated, service_role;
--
-- so every function created afterwards is granted to anon on creation. The
-- revokes in 1300 and 1400 named PUBLIC, which is a different grantee — the
-- explicit anon grant survived them untouched.
--
-- The consequence worth naming: recompute_act_timeline() is SECURITY DEFINER
-- and carries no authorisation check, because it is documented as reachable
-- only from confirm_act_selection(), which checks the caller first. Granted to
-- anon it became an unauthenticated way to reset the statutory dates on any
-- application whose id the caller knows. That is the hole this closes.
--
-- Revoking from anon alone is not enough either: review_office(), added in
-- 1200, was granted to authenticated but never revoked from PUBLIC, so anon
-- reached it through the PUBLIC grant and an anon-only revoke changed nothing.
-- The assertion at the foot of this file caught that on the first attempt.
--
-- Any future migration that creates a function must revoke from BOTH public
-- and anon, then grant explicitly.

revoke execute on function validate_act_choice(uuid, act_code)                from public, anon;
revoke execute on function confirm_act_selection(uuid, act_code, uuid, text)  from public, anon;
revoke execute on function query_act_selection(uuid, text)                    from public, anon;
revoke execute on function review_offices_by_district(text, verification_status, int, text) from public, anon;
revoke execute on function district_review_queue()                            from public, anon;

-- Reachable only from confirm_act_selection(), which is SECURITY DEFINER and
-- therefore runs it as the owner regardless of who may call it directly.
revoke execute on function recompute_act_timeline(uuid) from public, anon, authenticated;

-- Re-assert the intended grants, so this migration alone describes the end state.
grant execute on function validate_act_choice(uuid, act_code)                to authenticated;
grant execute on function confirm_act_selection(uuid, act_code, uuid, text)  to authenticated;
grant execute on function query_act_selection(uuid, text)                    to authenticated;
grant execute on function review_offices_by_district(text, verification_status, int, text) to authenticated;
grant execute on function district_review_queue()                            to authenticated;

-- ------------------------------------------------- carried over from 1200
-- review_office() is staff-only and checks is_staff() internally, so this was
-- not exploitable — it failed closed. Revoked anyway: a SECURITY DEFINER
-- function should not be reachable by a role that can never legitimately use it.
revoke execute on function review_office(uuid, verification_status, text) from public, anon;
grant  execute on function review_office(uuid, verification_status, text) to authenticated;

-- Fail the migration rather than report success on a database that is still open.
do $assert$
declare leaked text;
begin
  select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
    into leaked
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('validate_act_choice','confirm_act_selection','query_act_selection',
                      'recompute_act_timeline','review_offices_by_district','district_review_queue',
                      'review_office')
    and has_function_privilege('anon', p.oid, 'execute');
  if leaked is not null then
    raise exception 'anon can still execute: %', leaked;
  end if;

  if has_function_privilege('authenticated', 'recompute_act_timeline(uuid)', 'execute') then
    raise exception 'recompute_act_timeline must not be callable directly';
  end if;
end $assert$;
