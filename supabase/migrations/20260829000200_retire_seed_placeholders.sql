-- Take the structural seed placeholders back out of public view, and stop a
-- district review from ever publishing one again.
--
-- supabase/seed/002_offices.sql seeds one invented office per district so the
-- schema has something to point at, and says so. 20260825001200 reset them all
-- to PENDING_REVIEW for exactly that reason: their addresses were composed for
-- the seed, not copied from the department.
--
-- review_offices_by_district() then undid that. It verifies every
-- PENDING_REVIEW row in a district, and the placeholder sits in the district
-- like any other row, so approving Alipurduar published a composed address --
-- "District Registry Office, Alipurduar, Alipurduar, West Bengal" -- with an
-- Acts list no source supports, under a note saying it had been checked
-- against the departmental list. It had not been; there was nothing to check
-- it against. It was the only entry answering a search for the Christian and
-- Parsi Acts, so a citizen looking for either was being sent to an address
-- nobody had verified.
--
-- Two changes, because rejecting the rows alone would leave the mechanism that
-- published them intact for the other 22 districts.

-- 1. Retire every placeholder, whatever state a review left it in.
update offices
   set verification_status = 'REJECTED',
       review_note = 'Structural placeholder from the initial seed. The address was composed for the seed and is not from the departmental Marriage Officer list, so it must not be public. Retired by migration 20260829000200.',
       verified_by = null,
       verified_at = null,
       updated_at  = now()
 where source_document is null;

-- 2. Confine the bulk path to entries that came from a source document.
--
-- A district review is a statement about a published PDF: the reviewer read
-- the list and confirmed the register matches it. A row with no source
-- document is outside what that statement can cover, so it is no longer
-- eligible. Deciding one still has to go through review_office(), a single
-- entry at a time, by someone who has looked at it.
create or replace function review_offices_by_district(
  p_district       text,
  p_status         verification_status,
  p_expected_count int,
  p_note           text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  changed   int;
  touched   uuid[];
  office_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to review directory entries'; end if;
  if not is_admin() then
    raise exception 'Only an administrator may decide a whole district. Use review_office() for a single entry.';
  end if;
  if p_status = 'PENDING_REVIEW' then
    raise exception 'A review must record a decision: VERIFIED or REJECTED';
  end if;
  if p_note is null or btrim(p_note) = '' then
    raise exception 'Record what was checked against the source document';
  end if;

  if not exists (select 1 from districts where code = p_district) then
    raise exception 'Unknown district: %', p_district;
  end if;

  -- The update runs first and is undone by the RAISE below if the count
  -- disagrees. Counting first and then updating would leave a window in which
  -- an import adds a row between the two, and the reviewer would approve an
  -- entry they never saw. A transaction that rolls back cannot have that gap.
  with updated as (
    update offices
       set verification_status = p_status,
           review_note         = btrim(p_note),
           verified_by         = auth.uid(),
           verified_at         = now(),
           updated_at          = now()
     where district_code = p_district
       and verification_status = 'PENDING_REVIEW'
       -- A district review speaks for the published list. An entry that came
       -- from no document is not on that list and cannot be decided this way.
       and source_document is not null
    returning id)
  select coalesce(array_agg(id), '{}'::uuid[]) into touched from updated;

  changed := cardinality(touched);

  if changed <> p_expected_count then
    raise exception 'Expected % entries in %, found %. Nothing was changed.',
      p_expected_count, p_district, changed;
  end if;

  foreach office_id in array touched loop
    perform log_audit(null, 'office', office_id::text, 'office:' || p_status,
                      null, jsonb_build_object('status', p_status, 'note', btrim(p_note),
                                               'via', 'district'));
  end loop;

  return jsonb_build_object('district', p_district, 'status', p_status, 'changed', changed);
end $$;

revoke execute on function review_offices_by_district(text, verification_status, int, text)
  from public, anon;
grant  execute on function review_offices_by_district(text, verification_status, int, text)
  to authenticated;

do $assert$
declare leaked int;
begin
  select count(*) into leaked
    from offices
   where source_document is null
     and verification_status = 'VERIFIED';
  if leaked > 0 then
    raise exception '% seeded placeholder(s) are still public', leaked;
  end if;

  if has_function_privilege('anon',
       'review_offices_by_district(text, verification_status, int, text)', 'execute') then
    raise exception 'review_offices_by_district is anon-executable';
  end if;
end $assert$;
