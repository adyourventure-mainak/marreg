-- MARREG :: hardening the public objection endpoint.
--
-- file_objection is reachable by `anon` by design — an objector need not hold
-- an account. That makes it the most exposed write in the system, and it had
-- none of the protections such an endpoint needs.
--
-- Three separate problems:
--
--   1. ENUMERATION. Application numbers come from a sequence
--      (MR-<year>-000001, -000002, ...), so they are guessable by counting.
--      The function answered with three distinguishable errors: no such
--      number, exists but not in its objection period, and window closed on
--      <date>. Walking the sequence therefore revealed which marriages exist,
--      which are currently on public notice, and when each window closes.
--      For a marriage registry that is a personal-privacy leak, not merely an
--      information leak: it tells an observer whether a particular couple has
--      applied. All three now return one indistinguishable message.
--
--   2. NO RATE LIMIT. Nothing stopped a script filing thousands of objections
--      against a known number. Every objection blocks a registration and must
--      be examined by the officer, so this was a denial of service against a
--      citizen's marriage as well as against the office.
--
--   3. NO IDEMPOTENCY. A double-clicked form filed the objection twice.
--
-- On the shape of the return value: the function reports refusal by RETURNING
-- a code rather than by RAISE. A raised exception aborts the transaction and
-- would roll back the attempt-log row written just before it, leaving the rate
-- limiter with no record of the attempts it most needs to count. Postgres has
-- no autonomous transactions, so signalling through the return value is the
-- only way the log survives.
--
-- Deliberately NOT solved here: a CAPTCHA. Rate limiting raises the cost of
-- automation but does not stop a determined attacker rotating addresses. A
-- real deployment needs Turnstile or equivalent in front of this form; that
-- needs an account and keys, so it is left as a deployment step rather than
-- faked.

-- ------------------------------------------------------------ attempt log
-- Every attempt is recorded, successful or not, because rate limiting only
-- failures would let an attacker enumerate freely at full speed.
create table if not exists objection_attempts (
  id           bigserial primary key,
  client_hash  text not null,
  outcome      text not null check (outcome in ('FILED','DUPLICATE','REJECTED')),
  created_at   timestamptz not null default now()
);

create index if not exists objection_attempts_client_idx
  on objection_attempts (client_hash, created_at desc);

alter table objection_attempts enable row level security;
-- No policy: only SECURITY DEFINER functions (running as the owner) touch this.
revoke all on objection_attempts from anon, authenticated;
revoke all on sequence objection_attempts_id_seq from anon, authenticated;

-- ------------------------------------------------------------- idempotency
-- Same objector, same application, same grounds = one objection. Generated
-- rather than computed by the caller so it cannot be bypassed by a direct
-- insert (and md5/lower/trim are immutable, which a generated column requires).
alter table objections
  add column if not exists dedupe_key text
  generated always as (
    md5(application_id::text || '|' || lower(trim(objector_name)) || '|' || lower(trim(grounds)))
  ) stored;

create unique index if not exists objections_dedupe_idx on objections (dedupe_key);

-- --------------------------------------------------------------- the function
-- The old 4-argument form must go, or PostgREST sees an overloaded pair and
-- callers keep reaching the unprotected one.
drop function if exists file_objection(text, text, text, text);

-- Returns 'FILED:<application number>', 'DENIED', or 'THROTTLED'.
-- Genuine input errors still raise: there is nothing to log for those, and the
-- caller has not yet reached the rate limiter.
create function file_objection(
  p_number text, p_name text, p_contact text, p_grounds text, p_client text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  app         applications;
  recent_hour int;
  recent_day  int;
  client      text;
begin
  client := coalesce(nullif(trim(p_client), ''), 'unknown');

  if coalesce(trim(p_name),'') = '' or coalesce(trim(p_grounds),'') = '' then
    raise exception 'Enter your name and the grounds for your objection.';
  end if;

  -- Counted before the lookup, so a throttled caller learns nothing at all.
  select count(*) into recent_hour from objection_attempts
  where client_hash = client and created_at > now() - interval '1 hour';

  select count(*) into recent_day from objection_attempts
  where client_hash = client and created_at > now() - interval '1 day';

  if recent_hour >= 5 or recent_day >= 20 then
    insert into objection_attempts (client_hash, outcome) values (client, 'REJECTED');
    return 'THROTTLED';
  end if;

  select * into app from applications
  where application_number = upper(trim(p_number));

  -- One branch for every "you cannot object to this" case. Keeping them
  -- together is what stops the three outcomes drifting back into an oracle:
  -- no such number, wrong status, and closed window are indistinguishable.
  if not found
     or app.status <> 'NOTICE_PUBLISHED'
     or (app.objection_window_ends_at is not null
         and app.objection_window_ends_at < current_date) then
    insert into objection_attempts (client_hash, outcome) values (client, 'REJECTED');
    return 'DENIED';
  end if;

  begin
    insert into objections (application_id, objector_name, objector_contact, grounds)
    values (app.id, trim(p_name), nullif(trim(p_contact),''), trim(p_grounds));
  exception when unique_violation then
    -- Already filed. Reported as success: the objector's intent is on record,
    -- and saying "duplicate" would confirm a prior objection exists on this case.
    insert into objection_attempts (client_hash, outcome) values (client, 'DUPLICATE');
    return 'FILED:' || app.application_number;
  end;

  insert into objection_attempts (client_hash, outcome) values (client, 'FILED');

  perform log_audit(app.id, 'objection', app.id::text, 'objectionFiled',
                    null, jsonb_build_object('objector', trim(p_name)));

  return 'FILED:' || app.application_number;
end $$;

grant execute on function file_objection(text, text, text, text, text) to anon, authenticated;
