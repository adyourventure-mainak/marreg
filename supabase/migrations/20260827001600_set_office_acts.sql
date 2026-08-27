-- Assigning Acts to a directory entry.
--
-- The district PDFs name each officer and their jurisdiction but never say
-- which Acts that officer is empowered under, so the import left `acts` empty
-- rather than infer it from the designation string. A reviewer supplies it,
-- and because it is the one field in the directory that comes from a person's
-- judgement rather than from the source document, it is written through a
-- function that records who decided it.
--
-- Kept separate from review_office(): an entry may need its Acts corrected long
-- after it was verified, without that reopening the verification decision.

create or replace function set_office_acts(
  p_office uuid, p_acts act_code[], p_note text default null)
returns offices
language plpgsql security definer set search_path = public as $$
declare
  office offices;
  before act_code[];
begin
  if auth.uid() is null then raise exception 'Sign in to assign Acts'; end if;
  if not is_staff() then raise exception 'Only registry staff may assign Acts'; end if;

  -- An empty array is a legitimate state — it is what the import leaves behind
  -- and what a reviewer should see until they decide. A NULL is not: it would
  -- make `p_act = any(acts)` in search_offices() return NULL rather than false.
  if p_acts is null then raise exception 'Pass an array of Acts, empty if none apply'; end if;

  if exists (select 1 from unnest(p_acts) a group by a having count(*) > 1) then
    raise exception 'The same Act is listed twice';
  end if;

  select acts into before from offices where id = p_office;
  if not found then raise exception 'Directory entry not found'; end if;

  update offices
     set acts = p_acts, updated_at = now()
   where id = p_office
  returning * into office;

  perform log_audit(null, 'office', p_office::text, 'office:acts',
                    jsonb_build_object('acts', before),
                    jsonb_build_object('acts', p_acts, 'note', p_note));
  return office;
end $$;

revoke execute on function set_office_acts(uuid, act_code[], text) from public, anon;
grant  execute on function set_office_acts(uuid, act_code[], text) to authenticated;

do $assert$ begin
  if has_function_privilege('anon', 'set_office_acts(uuid,act_code[],text)', 'execute') then
    raise exception 'set_office_acts is anon-executable';
  end if;
end $assert$;
