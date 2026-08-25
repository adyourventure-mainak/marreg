-- MARREG :: public objection filing
--
-- Anyone may object while a notice is published, including people with no
-- account. RLS correctly hides `applications` from anonymous users, so the
-- lookup has to happen inside a SECURITY DEFINER function rather than in the
-- client. The function deliberately reveals nothing about an application
-- beyond whether an objection could be filed against it.

create or replace function file_objection(
  p_number text, p_name text, p_contact text, p_grounds text)
returns text
language plpgsql security definer set search_path = public as $$
declare app applications;
begin
  if coalesce(trim(p_name),'') = '' or coalesce(trim(p_grounds),'') = '' then
    raise exception 'Enter your name and the grounds for your objection.';
  end if;

  select * into app from applications
  where application_number = upper(trim(p_number));

  if not found then
    raise exception 'No application was found with that number.';
  end if;

  if app.status <> 'NOTICE_PUBLISHED' then
    raise exception 'This application is not currently within its objection period.';
  end if;

  if app.objection_window_ends_at is not null and app.objection_window_ends_at < current_date then
    raise exception 'The objection period for this application closed on %.', app.objection_window_ends_at;
  end if;

  insert into objections (application_id, objector_name, objector_contact, grounds)
  values (app.id, trim(p_name), nullif(trim(p_contact),''), trim(p_grounds));

  perform log_audit(app.id, 'objection', app.id::text, 'objectionFiled',
                    null, jsonb_build_object('objector', trim(p_name)));

  return app.application_number;
end $$;

grant execute on function file_objection(text, text, text, text) to anon, authenticated;

-- An objection is evidence in a live case: only the office may read one back.
revoke insert on objections from anon;
