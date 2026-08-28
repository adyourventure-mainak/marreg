-- Registry-level audit events were written but could never be read.
--
-- invite_staff, revoke_staff_invitation and set_user_role record their entries
-- with application_id null, because an authorisation concerns a login rather
-- than any one application. audit_read admitted only rows with a non-null
-- application_id, so the trail those functions write was invisible to
-- everyone, including the administrator who is meant to be accountable for it.
--
-- Application-scoped visibility is unchanged. The registry-level entries go to
-- RGM administrators alone: a district registrar has no business reading who
-- was granted a login in another district.
drop policy if exists audit_read on audit_events;
create policy audit_read on audit_events for select
  using (
    (application_id is not null and may_read_app(application_id))
    or (application_id is null and current_user_role() = 'RGM_ADMIN')
  );
