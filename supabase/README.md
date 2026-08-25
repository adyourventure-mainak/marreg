# MARREG database

Everything the portal needs lives in this Supabase project. There is no separate
API server — the Next.js app talks to Postgres directly, and every rule that
matters is enforced in the database rather than in the browser.

## Apply the schema

Run these four files **in order**, in the Supabase SQL editor
(Dashboard → SQL Editor → New query → paste → Run):

| Order | File | What it does |
|---|---|---|
| 1 | `migrations/20260825000100_init.sql` | enums, tables, indexes, the profile trigger |
| 2 | `migrations/20260825000200_rls.sql` | row level security, storage bucket + policies |
| 3 | `migrations/20260825000300_functions.sql` | submit, state machine, document review, search |
| 4 | `seed/001_reference.sql` | the 23 West Bengal districts and the fee schedule |
| 5 | `seed/002_offices.sql` | starter Marriage Officer directory |

Or, with the Supabase CLI linked to the project:

```bash
supabase db push
psql "$DATABASE_URL" -f supabase/seed/001_reference.sql
psql "$DATABASE_URL" -f supabase/seed/002_offices.sql
```

## The office directory

`seed/002_offices.sql` is a **structural** seed: one office per district plus
the main sub-divisional offices, with officer names and contact details left
blank. It exists so office search and the application flow work end to end.

Replace it with the official directory as soon as you have it:

```bash
export SUPABASE_URL=https://<project>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<service role key>
npx tsx scripts/import-offices.ts offices.csv
```

## Where the rules live

- **Who can see what** — `20260825000200_rls.sql`. An applicant sees only their
  own applications; staff see applications routed to the office on their
  profile; `RGM_ADMIN` and `DISTRICT_REGISTRAR` see everything.
- **What a submission requires** — `submit_application()`. Two applicants, a
  chosen office, and at least one identity or age proof. It also issues the
  application number and computes the objection window and registration
  deadline from the Act.
- **Which status changes are legal** — `transition_application()`. Anything not
  in its transition table is rejected, and every move writes an audit row.
- **Document files** — the private `marreg-docs` bucket. A file at
  `<application_id>/<type>-<uuid>.<ext>` is readable by the applicant who owns
  that application and by the staff of its office, and by nobody else.

## Making someone a Marriage Officer

1. They sign up through the site like any citizen.
2. An `RGM_ADMIN` opens `/en/admin`, sets their role and office, and saves.

To create the very first admin, run this once in the SQL editor:

```sql
update profiles set role = 'RGM_ADMIN' where email = 'you@example.com';
```

## Migration order

`20260825000400_objections.sql` was added after the first four and must be run
too. Running the whole `migrations/` directory in filename order is always
correct — every file is written to be safely re-runnable.
