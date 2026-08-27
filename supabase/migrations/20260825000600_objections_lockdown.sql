-- MARREG :: close the direct-insert path into `objections`
--
-- Migration 200 created `objections_insert ... with check (true)` and granted
-- insert to `anon, authenticated`, so that the public could file objections.
-- Migration 400 replaced that route with `file_objection()` — a SECURITY
-- DEFINER function that checks the application exists, that its status is
-- NOTICE_PUBLISHED, and that the objection window is still open — and revoked
-- insert from `anon`.
--
-- It did not revoke insert from `authenticated`. Anyone can create an account,
-- so any signed-in user could still POST a row straight into `objections`
-- against any application_id, bypassing every check in `file_objection()`:
-- objecting to an application that has no published notice, or whose window
-- closed months ago. An objection blocks a registration, so that is a denial
-- of service against a citizen's marriage, not merely bad data.
--
-- `file_objection()` is SECURITY DEFINER and runs as its owner, so it is
-- unaffected by both the revoke and the dropped policy. It remains the only
-- way an objection can be created.

revoke insert on objections from authenticated;

-- Belt and braces: without an insert policy, RLS refuses the write even if a
-- future migration re-grants insert by accident.
drop policy if exists objections_insert on objections;

-- Reading and staff updates are unchanged; both are already gated
-- (`may_read_app`, `is_staff`) by migration 200.
