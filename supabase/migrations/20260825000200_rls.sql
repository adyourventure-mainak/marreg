-- MARREG :: row level security

alter table districts      enable row level security;
alter table offices        enable row level security;
alter table profiles       enable row level security;
alter table applications   enable row level security;
alter table parties        enable row level security;
alter table witnesses      enable row level security;
alter table documents      enable row level security;
alter table objections     enable row level security;
alter table audit_events   enable row level security;
alter table fee_schedule   enable row level security;

-- ------------------------------------------------- public reference data
drop policy if exists districts_read on districts;
create policy districts_read on districts for select using (true);

drop policy if exists offices_read on offices;
create policy offices_read on offices for select using (true);

drop policy if exists offices_admin_write on offices;
create policy offices_admin_write on offices for all
  using (is_admin()) with check (is_admin());

drop policy if exists fees_read on fee_schedule;
create policy fees_read on fee_schedule for select using (true);

drop policy if exists fees_admin_write on fee_schedule;
create policy fees_admin_write on fee_schedule for all
  using (is_admin()) with check (is_admin());

-- ------------------------------------------------- profiles
drop policy if exists profiles_self_read on profiles;
create policy profiles_self_read on profiles for select
  using (id = auth.uid() or is_staff());

drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles for update
  using (id = auth.uid()) with check (id = auth.uid() and role = current_user_role());

drop policy if exists profiles_admin_all on profiles;
create policy profiles_admin_all on profiles for all
  using (is_admin()) with check (is_admin());

-- ------------------------------------------------- applications
-- an applicant sees only their own; staff see applications routed to their office
-- (district registrars and RGM admins see everything).
create or replace function can_view_application(app applications) returns boolean
language sql stable security definer set search_path = public as $$
  select app.owner_id = auth.uid()
      or is_admin()
      or (is_staff() and app.office_id is not null and app.office_id = current_user_office())
$$;

drop policy if exists applications_read on applications;
create policy applications_read on applications for select
  using (can_view_application(applications));

drop policy if exists applications_insert on applications;
create policy applications_insert on applications for insert
  with check (owner_id = auth.uid());

-- applicants may edit only while the application is still theirs to edit
drop policy if exists applications_owner_update on applications;
create policy applications_owner_update on applications for update
  using (owner_id = auth.uid() and status in ('DRAFT','AWAITING_APPLICANT_FIX'))
  with check (owner_id = auth.uid());

drop policy if exists applications_staff_update on applications;
create policy applications_staff_update on applications for update
  using (is_admin() or (is_staff() and office_id = current_user_office()))
  with check (is_admin() or (is_staff() and office_id = current_user_office()));

drop policy if exists applications_owner_delete on applications;
create policy applications_owner_delete on applications for delete
  using (owner_id = auth.uid() and status = 'DRAFT');

-- ------------------------------------------------- child tables
-- one helper keeps every child table's policy identical to the parent's.
create or replace function may_read_app(app_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.applications a
    where a.id = app_id
      and (a.owner_id = auth.uid()
           or public.is_admin()
           or (public.is_staff() and a.office_id = public.current_user_office())))
$$;

create or replace function may_edit_app(app_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.applications a
    where a.id = app_id
      and a.owner_id = auth.uid()
      and a.status in ('DRAFT','AWAITING_APPLICANT_FIX'))
$$;

do $$ declare t text;
begin
  foreach t in array array['parties','witnesses','documents'] loop
    execute format('drop policy if exists %1$s_read on %1$s', t);
    execute format('create policy %1$s_read on %1$s for select using (may_read_app(application_id))', t);

    execute format('drop policy if exists %1$s_owner_write on %1$s', t);
    execute format('create policy %1$s_owner_write on %1$s for all using (may_edit_app(application_id)) with check (may_edit_app(application_id))', t);

    execute format('drop policy if exists %1$s_staff_write on %1$s', t);
    execute format('create policy %1$s_staff_write on %1$s for update using (is_staff() and may_read_app(application_id)) with check (is_staff() and may_read_app(application_id))', t);
  end loop;
end $$;

-- ------------------------------------------------- objections (public may file)
drop policy if exists objections_insert on objections;
create policy objections_insert on objections for insert with check (true);

drop policy if exists objections_read on objections;
create policy objections_read on objections for select
  using (may_read_app(application_id));

drop policy if exists objections_staff_update on objections;
create policy objections_staff_update on objections for update
  using (is_staff()) with check (is_staff());

-- ------------------------------------------------- audit (read-only to users)
drop policy if exists audit_read on audit_events;
create policy audit_read on audit_events for select
  using (application_id is not null and may_read_app(application_id));

-- audit rows are written by security-definer functions only; no insert policy.

-- ------------------------------------------------- storage
insert into storage.buckets (id, name, public)
values ('marreg-docs','marreg-docs', false)
on conflict (id) do nothing;

-- documents live at  marreg-docs/<application_id>/<document_type>-<uuid>.<ext>
drop policy if exists marreg_docs_read on storage.objects;
create policy marreg_docs_read on storage.objects for select
  using (bucket_id = 'marreg-docs'
         and may_read_app(nullif(split_part(name,'/',1),'')::uuid));

drop policy if exists marreg_docs_write on storage.objects;
create policy marreg_docs_write on storage.objects for insert
  with check (bucket_id = 'marreg-docs'
              and may_edit_app(nullif(split_part(name,'/',1),'')::uuid));

drop policy if exists marreg_docs_delete on storage.objects;
create policy marreg_docs_delete on storage.objects for delete
  using (bucket_id = 'marreg-docs'
         and may_edit_app(nullif(split_part(name,'/',1),'')::uuid));

-- ------------------------------------------------- grants
-- Supabase grants these by default on tables created in `public`, but being
-- explicit means the schema is correct even if those defaults ever change.
-- RLS above is what actually restricts the rows; these only open the door.
grant usage on schema public to anon, authenticated;

grant select on districts, offices, fee_schedule to anon, authenticated;
grant select, insert, update, delete on applications, parties, witnesses, documents to authenticated;
grant select, update on profiles to authenticated;
grant select on audit_events to authenticated;
grant insert on objections to anon, authenticated;
grant select, update on objections to authenticated;
grant all on offices, fee_schedule to authenticated;
grant usage, select on all sequences in schema public to authenticated;
