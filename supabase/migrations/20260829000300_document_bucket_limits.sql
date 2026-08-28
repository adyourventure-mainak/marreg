-- Constrain uploads at the bucket, not only in the server action.
--
-- uploadDocument() in app/actions/applications.ts already refuses anything over
-- 5 MB and sniffs the magic bytes before storing, so the extension it writes
-- comes from the content rather than the filename. All of that is real, and all
-- of it is bypassable: marreg_docs_write only asks may_edit_app(), so an
-- applicant holding a session can PUT straight at the Storage REST API for
-- their own application id and skip the action entirely. The bucket carried no
-- file_size_limit and no allowed_mime_types, so that direct path accepted a
-- file of any type and any size.
--
-- These two values deliberately mirror lib/documents.ts (MAX_BYTES and the
-- SafeMime union). Storage checks the declared content type, which is weaker
-- than the magic-byte sniff the action performs — this does not replace that
-- check, it puts a floor under the path that never reaches it.
--
-- If lib/documents.ts ever accepts another type, this must change with it.

update storage.buckets
   set file_size_limit    = 5 * 1024 * 1024,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf']
 where id = 'marreg-docs';

do $assert$
declare
  lim  bigint;
  mimes text[];
begin
  select file_size_limit, allowed_mime_types
    into lim, mimes
    from storage.buckets
   where id = 'marreg-docs';

  if lim is null or lim <> 5 * 1024 * 1024 then
    raise exception 'marreg-docs must cap uploads at 5 MB (found %)', lim;
  end if;

  if mimes is null or cardinality(mimes) <> 4 then
    raise exception 'marreg-docs must restrict upload types (found %)', mimes;
  end if;

  if exists (select 1 from storage.buckets where id = 'marreg-docs' and public) then
    raise exception 'marreg-docs must not be a public bucket';
  end if;
end
$assert$;
