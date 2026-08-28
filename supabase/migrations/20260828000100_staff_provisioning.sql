-- Staff and officer logins are provisioned by administrators, never self-served.
--
-- Two shaping rules:
--   1. Signing up is how a *citizen* gets an account. It can never be how
--      anyone gets a staff role. A staff role exists only because a named
--      administrator authorised that exact address in advance.
--   2. A staff member may not move their own jurisdiction. office_id is the
--      only boundary between one office's applications and another's, so it
--      is set by the administrator who provisioned the account and by no one
--      else -- least of all its holder.

-- -------------------------------------------------------- approved addresses
create table if not exists staff_invitations (
  email       text primary key,
  role        user_role not null,
  office_id   uuid references offices(id),
  note        text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  consumed_at timestamptz,
  consumed_by uuid references auth.users(id),
  revoked_at  timestamptz,
  constraint staff_invitations_email_normalised check (email = lower(btrim(email))),
  constraint staff_invitations_not_applicant     check (role <> 'APPLICANT'),
  -- an officer without an office has no jurisdiction and no meaning
  constraint staff_invitations_office_required   check (
    role in ('RGM_ADMIN','AUDITOR','SUPPORT_READONLY') or office_id is not null)
);

alter table staff_invitations enable row level security;

-- Invitations are written only through the audited security-definer functions
-- below. District registrars are intentionally excluded: they must never be
-- able to create a higher-privilege account or alter an office boundary.
drop policy if exists staff_invitations_admin_all on staff_invitations;
create policy staff_invitations_rgm_read on staff_invitations for select
  using (current_user_role() = 'RGM_ADMIN');

revoke all on staff_invitations from public, anon, authenticated;
grant select on staff_invitations to authenticated;

-- --------------------------------------------------------- apply on sign-up
-- Replaces the trigger from 20260825000100_init.sql. A new auth user still
-- gets a profile; it now also gets whatever role an administrator authorised
-- for that address beforehand. With no invitation the role stays APPLICANT.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  invite staff_invitations;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
  on conflict (id) do nothing;

  select * into invite from staff_invitations
   where email = lower(btrim(new.email))
     and revoked_at is null
     and consumed_at is null;

  if found then
    update public.profiles
       set role = invite.role, office_id = invite.office_id, updated_at = now()
     where id = new.id;

    update staff_invitations
       set consumed_at = now(), consumed_by = new.id
     where email = invite.email;
  end if;

  return new;
end $fn$;

-- ------------------------------------------------------------ admin actions
create or replace function invite_staff(
  p_email text, p_role user_role, p_office uuid default null, p_note text default null)
returns staff_invitations
language plpgsql security definer set search_path = public as $fn$
declare
  norm text := lower(btrim(coalesce(p_email, '')));
  row  staff_invitations;
begin
  if current_user_role() <> 'RGM_ADMIN' then
    raise exception 'Only an administrator may authorise a staff login';
  end if;
  if norm = '' or norm not like '%_@_%._%' then
    raise exception 'Enter a valid email address';
  end if;
  if p_role = 'APPLICANT' then
    raise exception 'Citizens register themselves; an invitation is for staff roles only';
  end if;
  if p_role not in ('RGM_ADMIN','AUDITOR','SUPPORT_READONLY') and p_office is null then
    raise exception 'This staff role requires an office';
  end if;

  insert into staff_invitations (email, role, office_id, note, created_by)
  values (norm, p_role, p_office, nullif(btrim(p_note), ''), auth.uid())
  on conflict (email) do update
    set role = excluded.role, office_id = excluded.office_id, note = excluded.note,
        created_by = excluded.created_by, created_at = now(),
        consumed_at = null, consumed_by = null, revoked_at = null
  returning * into row;

  -- An invitation authorises a login that does not exist yet, so there is no
  -- application to attach the entry to.
  perform log_audit(null, 'staff:invitation', norm, 'staff:invited',
                    null, jsonb_build_object('role', p_role, 'office_id', p_office));
  return row;
end $fn$;

create or replace function revoke_staff_invitation(p_email text)
returns void language plpgsql security definer set search_path = public as $fn$
declare norm text := lower(btrim(coalesce(p_email, '')));
begin
  if current_user_role() <> 'RGM_ADMIN' then
    raise exception 'Only an administrator may revoke a staff login';
  end if;
  update staff_invitations set revoked_at = now() where email = norm and revoked_at is null;
  if not found then
    raise exception 'No active invitation for %', norm;
  end if;
  perform log_audit(null, 'staff:invitation', norm, 'staff:revoked', null, null);
end $fn$;

-- Changing an existing account's role or office. Kept as a function so every
-- such change is audited, and so profiles itself can stay column-locked.
create or replace function set_user_role(p_user uuid, p_role user_role, p_office uuid default null)
returns void language plpgsql security definer set search_path = public as $fn$
declare before_role user_role; before_office uuid;
begin
  if current_user_role() <> 'RGM_ADMIN' then
    raise exception 'Only an administrator may change a role';
  end if;
  if p_user = auth.uid() then
    raise exception 'You may not change your own role';
  end if;

  select role, office_id into before_role, before_office from profiles where id = p_user;
  if not found then
    raise exception 'No such user';
  end if;
  if p_role not in ('RGM_ADMIN','AUDITOR','SUPPORT_READONLY') and p_office is null then
    raise exception 'This staff role requires an office';
  end if;

  update profiles set role = p_role, office_id = p_office, updated_at = now() where id = p_user;

  perform log_audit(null, 'profile', p_user::text, 'role:changed',
                    jsonb_build_object('role', before_role, 'office_id', before_office),
                    jsonb_build_object('role', p_role,      'office_id', p_office));
end $fn$;

-- ------------------------------------------------------- lock down profiles
-- The policy already pinned role; office_id was left open, which let a staff
-- member grant themselves another office's caseload. Column privileges are
-- the durable guard: they hold even if a future policy is written loosely.
drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid()
              and role = current_user_role()
              and office_id is not distinct from current_user_office());

revoke update on profiles from authenticated;
grant  update (full_name, mobile) on profiles to authenticated;

revoke execute on function invite_staff(text, user_role, uuid, text) from public, anon;
revoke execute on function revoke_staff_invitation(text)             from public, anon;
revoke execute on function set_user_role(uuid, user_role, uuid)      from public, anon;
revoke execute on function handle_new_user()                         from public, anon, authenticated;

grant execute on function invite_staff(text, user_role, uuid, text) to authenticated;
grant execute on function revoke_staff_invitation(text)             to authenticated;
grant execute on function set_user_role(uuid, user_role, uuid)      to authenticated;

-- ------------------------------------------------------------------ asserts
do $assert$
declare bad text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('invite_staff','revoke_staff_invitation','set_user_role','handle_new_user')
     and has_function_privilege('anon', p.oid, 'execute');
  if bad is not null then
    raise exception 'still anon-executable: %', bad;
  end if;

  if has_column_privilege('authenticated', 'public.profiles', 'role', 'update')
     or has_column_privilege('authenticated', 'public.profiles', 'office_id', 'update') then
    raise exception 'profiles.role / profiles.office_id are still self-updatable';
  end if;

  if not has_column_privilege('authenticated', 'public.profiles', 'full_name', 'update') then
    raise exception 'citizens can no longer edit their own name';
  end if;

  if has_table_privilege('authenticated', 'public.staff_invitations', 'insert')
     or has_table_privilege('authenticated', 'public.staff_invitations', 'update')
     or has_table_privilege('authenticated', 'public.staff_invitations', 'delete') then
    raise exception 'staff invitations are directly writable';
  end if;
end $assert$;
