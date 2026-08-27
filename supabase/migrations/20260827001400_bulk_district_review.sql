-- District-level review of directory entries.
--
-- 554 officer records arrived from the district PDFs in one import. Reviewing
-- them one row at a time is not review, it is 554 clicks, and a process that
-- tedious gets satisfied by clicking rather than by reading. The unit that
-- actually matches the evidence is the district: one source PDF, one generated
-- date, one officer who can say "I have read this list against the document".
--
-- So this decides a district at a time, and takes three precautions against
-- that becoming a rubber stamp:
--
--   1. The caller states how many entries they reviewed. If the count does not
--      match what is actually pending, nothing is written. A district that grew
--      since the reviewer opened it cannot be approved by a stale click.
--   2. Only PENDING_REVIEW rows are touched. An entry already decided is never
--      silently re-decided by a later sweep over its district.
--   3. Every row still gets its own audit event carrying the reviewer and the
--      note, so the ledger is per-record even though the decision was made in
--      bulk. A later question about one officer is answerable without knowing
--      that a bulk action ever happened.
--
-- Deciding a whole district is a supervisory act rather than clerical work, so
-- it is limited to admins. Ordinary staff keep review_office() for single rows.

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
    returning id)
  select coalesce(array_agg(id), '{}'::uuid[]) into touched from updated;

  changed := cardinality(touched);

  if changed <> p_expected_count then
    raise exception
      'This district has % entries awaiting review, not %. Reload the list and check the entries again.',
      changed, p_expected_count;
  end if;

  -- Per-row provenance, so one officer's history reads the same whether the
  -- decision was made singly or as part of a district.
  foreach office_id in array touched loop
    perform log_audit(null, 'office', office_id::text, 'office:' || p_status,
                      jsonb_build_object('status', 'PENDING_REVIEW'),
                      jsonb_build_object('status', p_status, 'note', btrim(p_note),
                                         'via', 'district', 'district', p_district));
  end loop;

  return jsonb_build_object(
    'district', p_district,
    'status',   p_status,
    'reviewed', changed);
end $$;

comment on function review_offices_by_district(text, verification_status, int, text) is
  'Decide every pending directory entry in one district. Admin only. Refuses '
  'unless the caller''s expected count matches what is actually pending.';

revoke execute on function review_offices_by_district(text, verification_status, int, text) from public;
grant  execute on function review_offices_by_district(text, verification_status, int, text) to authenticated;

-- ------------------------------------------------------------- review queue
-- What the reviewer opens before deciding: one row per district with the
-- source documents it came from, so the count they confirm is a count they
-- have seen next to the evidence it came from.
create or replace function district_review_queue()
returns table (
  district_code  text,
  district_name  text,
  pending        bigint,
  verified       bigint,
  rejected       bigint,
  sources        text[],
  generated_on   date)
language sql stable security definer set search_path = public as $$
  select d.code, d.name,
         count(*) filter (where o.verification_status = 'PENDING_REVIEW'),
         count(*) filter (where o.verification_status = 'VERIFIED'),
         count(*) filter (where o.verification_status = 'REJECTED'),
         array_agg(distinct o.source_document) filter (where o.source_document is not null),
         max(o.source_generated_on)
  from districts d
  join offices o on o.district_code = d.code
  where is_staff()
  group by d.code, d.name
  having count(*) filter (where o.verification_status = 'PENDING_REVIEW') > 0
  order by d.name
$$;

revoke execute on function district_review_queue() from public;
grant  execute on function district_review_queue() to authenticated;
