# Database tests

These run the schema against a throwaway local Postgres — no Supabase project
needed — and check the two things worth being sure about: that the application
workflow behaves, and that one citizen cannot reach another's file.

`00_supabase_stubs.sql` fakes the parts Supabase manages (`auth.users`,
`auth.uid()`, the storage tables, the `anon`/`authenticated` roles). It is a
test fixture only and must never be run against the real project.

```bash
export PATH=/usr/lib/postgresql/16/bin:$PATH
initdb -D /tmp/pgdata -U postgres
pg_ctl -D /tmp/pgdata -o "-k /tmp -p 5433" -l /tmp/pg.log start
createdb -h /tmp -p 5433 -U postgres marreg

for f in supabase/tests/00_supabase_stubs.sql \
         supabase/migrations/*.sql \
         supabase/seed/*.sql; do
  psql -h /tmp -p 5433 -U postgres -d marreg -v ON_ERROR_STOP=1 -f "$f"
done

psql -h /tmp -p 5433 -U postgres -d marreg -f supabase/tests/01_application_flow.sql
psql -h /tmp -p 5433 -U postgres -d marreg -f supabase/tests/02_rls_isolation.sql
psql -h /tmp -p 5433 -U postgres -d marreg -f supabase/tests/03_public_objection.sql
```

## What they assert

**01_application_flow.sql**
- a profile row appears automatically when an auth user is created
- office search filters by district and Act
- submitting is refused with no applicants, and refused again with no documents
- a real submission issues `MR-YYYY-NNNNNN` and derives the objection window
  (7 days for HMA) and registration deadline (6 months) from the Act
- an applicant cannot drive the state machine
- an illegal transition (`SUBMITTED` → `registered`) is refused
- the legal path runs through to `CERTIFICATE_ISSUED` and every step is audited
- public tracking works with the right date of birth and returns nothing with
  the wrong one

**02_rls_isolation.sql**
- a signed-in stranger reads zero rows from applications, parties, documents,
  witnesses, and audit events
- a stranger cannot read another person's profile
- a user cannot promote themselves to `RGM_ADMIN`
- a user cannot create an application owned by someone else
- the real owner still sees their own application

**03_public_objection.sql**
- an anonymous visitor with no account can file an objection against an
  application whose notice is published
- that same visitor still cannot read the `applications` or `objections` tables
- an unknown application number is refused
- an application outside its notice period is refused
- the Marriage Officer handling the case can read the objection back
