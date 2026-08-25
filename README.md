# MARREG — West Bengal marriage registration

A rebuild of the Office of the Registrar General of Marriages citizen portal.

**Stack:** Next.js 15 (App Router) on Vercel · Supabase for Postgres, Auth, and
file storage. There is no separate API service — server actions talk to
Postgres, and the rules that matter (who sees what, what a valid submission is,
which status changes are legal) are enforced in the database itself.

## What works today

| Flow | Where |
|---|---|
| Sign up / sign in with email + password, or Google | `/en/signup`, `/en/login` |
| Read the requirements for each of the five Acts | `/en/acts` |
| Find a Marriage Officer by district, police station, pincode, or Act | `/en/offices` |
| Apply: applicants → marriage & office → witnesses → documents → review & submit | `/en/apply` |
| Resume a saved draft | `/en/account` |
| Track an application without signing in (number + date of birth) | `/en/status` |
| File an objection during a notice period | `/en/objections` |
| Officer desk: queues, document verification, workflow transitions, audit trail | `/en/officer` |
| Assign staff roles and offices | `/en/admin` |

Phone OTP login is deliberately not implemented.

## Setting it up

### 1. Database

Follow [`supabase/README.md`](supabase/README.md) — five SQL files, run in order
in the Supabase SQL editor.

### 2. Supabase Auth settings

Dashboard → Authentication:

- **URL Configuration → Site URL**: your deployed origin, e.g.
  `https://marreg.vercel.app`
- **URL Configuration → Redirect URLs**: add
  `https://marreg.vercel.app/auth/callback` and `http://localhost:3000/auth/callback`
- **Providers → Email**: enabled, "Confirm email" on
- **Providers → Google**: enabled, with a Google Cloud OAuth client whose
  authorised redirect URI is `https://<project>.supabase.co/auth/v1/callback`

### 3. Environment variables

Copy `.env.example` to `.env.local` for local work, and set the same three in
Vercel → Project → Settings → Environment Variables (Production **and**
Preview):

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_SITE_URL=https://marreg.vercel.app
```

`NEXT_PUBLIC_SITE_URL` is what auth confirmation emails and the Google redirect
come back to. Get it wrong and sign-in will bounce to the wrong host.

The service role key is never used by the app — only by
`scripts/import-offices.ts`, from your own machine.

### 4. Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # what Vercel runs
```

### 5. Make yourself an admin

Sign up through the site, then in the Supabase SQL editor:

```sql
update profiles set role = 'RGM_ADMIN' where email = 'you@example.com';
```

Now `/en/admin` lets you assign Marriage Officer roles and offices to other
accounts, and `/en/officer` shows the registry desk.

## Layout

```
app/
  [locale]/           pages, one folder per route (en / bn)
  actions/            server actions — the only place the app writes data
  auth/callback/      email confirmation, password reset, Google return
components/           Shell (header/footer), ui kit, the wizard, forms
lib/
  acts.ts             the five Acts: periods, deadlines, documents, eligibility
  types.ts            row types, status labels, citizen-facing guidance
  supabase/           browser / server / middleware clients
supabase/
  migrations/         schema, RLS, business-rule functions
  seed/               districts, fees, starter office directory
scripts/              CSV importer for the official office directory
```

## Known gaps

- **The office directory is a structural seed**, not the official list. Officer
  names and contact details are blank on purpose. Import the real directory with
  `scripts/import-offices.ts` before this goes anywhere near the public.
- **Fees are indicative.** Every row in `fee_schedule` is marked
  "Pending verification" until checked against the current gazette notification.
- **No payment gateway yet.** `PAYMENT_PENDING` exists in the state machine but
  submission currently goes straight to `SUBMITTED`.
- **Bengali is routing only.** `/bn` renders, but the strings are still English.
- **No notice PDF or certificate generation.**
