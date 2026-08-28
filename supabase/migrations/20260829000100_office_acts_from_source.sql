-- Record the Acts the district PDFs actually assign to each officer.
--
-- 20260827001600 left `acts` empty on every imported entry and said the source
-- "never say which Acts that officer is empowered under". That was wrong, and
-- this migration corrects both the data and the claim. Every district PDF is
-- headed:
--
--     NON OFFICIAL MARRIAGE OFFICER & HINDU MARRIAGE REGISTRAR DETAILS
--     GOVERNMENT OF WEST BENGAL
--
-- The department is naming two statutory appointments, not describing a job:
--
--   * Marriage Officer -- the office created by section 3 of the Special
--     Marriage Act, 1954. Sections 13 and 16 are both exercised by that same
--     officer, so both codes follow from the one appointment.
--   * Hindu Marriage Registrar -- the registrar under section 8 of the Hindu
--     Marriage Act, 1955.
--
-- So {HMA_1955, SMA_13, SMA_16} is read off the source. ICMA_1872 and
-- PMDA_1936 are deliberately NOT added: those Acts appoint their own
-- registrars (Indian Christian Marriage Act, 1872 Part III; Parsi Marriage and
-- Divorce Act, 1936 section 7), and nothing in these PDFs says these officers
-- hold those appointments. An officer wrongly listed under an Act they cannot
-- register sends a couple to the wrong counter.
--
-- Where an individual entry turns out to differ, a reviewer corrects it with
-- set_office_acts(), which records who decided. This migration does not touch
-- an entry a reviewer has already given Acts to.

-- The audit entry carries a null actor on purpose. No person judged these rows
-- one by one; the department's own page header did, and this migration is the
-- reviewable record of reading it.
do $$
declare
  touched int;
  office  record;
begin
  for office in
    select id, acts from offices
     where designation = 'Non-official Marriage Officer / Hindu Marriage Registrar'
       and source_document is not null
       and cardinality(acts) = 0
  loop
    update offices
       set acts = '{HMA_1955,SMA_13,SMA_16}'::act_code[],
           updated_at = now()
     where id = office.id;

    perform log_audit(null, 'office', office.id::text, 'office:acts',
      jsonb_build_object('acts', office.acts),
      jsonb_build_object(
        'acts', array['HMA_1955','SMA_13','SMA_16'],
        'note', 'Set from the source PDF header: NON OFFICIAL MARRIAGE OFFICER & HINDU MARRIAGE REGISTRAR DETAILS. Migration 20260829000100.'));
  end loop;

  get diagnostics touched = row_count;
  raise notice 'office acts backfilled from the source header';
end $$;

-- The Acts are what the directory is filtered by, so leaving any imported entry
-- empty would keep it invisible to a citizen searching by Act. Fail loudly
-- rather than report success on a half-filled directory.
do $assert$
declare empty_count int;
begin
  select count(*) into empty_count
    from offices
   where source_document is not null
     and cardinality(acts) = 0;

  if empty_count > 0 then
    raise exception '% imported directory entries still have no Acts', empty_count;
  end if;

  if exists (
    select 1 from offices
     where source_document is not null
       and ('ICMA_1872' = any(acts) or 'PMDA_1936' = any(acts))
  ) then
    raise exception 'an imported entry claims an Act the source does not support';
  end if;
end $assert$;
