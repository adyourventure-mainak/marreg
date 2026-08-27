-- MARREG :: Act rules become a table, not a literal
--
-- `act_rule()` in migration 300 carried the statutory periods in an inline
-- VALUES list, and lib/acts.ts carried the same five rows in TypeScript. Two
-- copies of a legal rule drift: an amendment applied to one is silently not
-- applied to the other, and the objection window a citizen is shown stops
-- matching the one the registry actually enforces.
--
-- This table is the single source of truth. `act_rule()` now reads it, so
-- submit_application() computes its dates from the table. The TypeScript in
-- lib/acts.ts keeps a copy for rendering only, and lib/acts.drift.test.ts
-- parses the seed below and fails the build if the two disagree.
--
-- Amending an Act therefore means: change the seed here, run the migration,
-- update lib/acts.ts to match, and the test confirms they agree.

create table if not exists act_rules (
  code                        act_code primary key,
  objection_days              int     not null check (objection_days >= 0),
  notice_days                 int              check (notice_days >= 0),
  deadline_months             int     not null check (deadline_months > 0),
  already_solemnised          boolean not null,
  minimum_days_after_marriage int              check (minimum_days_after_marriage >= 0),
  minimum_age                 int     not null check (minimum_age >= 18),
  display_order               int     not null,
  required_witnesses          int     not null default 3
                                      check (required_witnesses between 2 and 4),
  updated_at                  timestamptz not null default now()
);

comment on table act_rules is
  'Statutory periods per Act. Single source of truth; lib/acts.ts mirrors this for display only.';

-- MARREG-SEED-BEGIN  (parsed by lib/acts.drift.test.ts — keep the shape)
insert into act_rules (code, objection_days, notice_days, deadline_months,
                       already_solemnised, minimum_days_after_marriage,
                       minimum_age, display_order, required_witnesses) values
  ('HMA_1955',   7, null, 6, true,  null, 18, 1, 3),
  ('SMA_13',    30,   30, 3, false, null, 18, 2, 3),
  ('SMA_16',    30, null, 6, true,    30, 18, 3, 3),
  ('ICMA_1872', 30,   30, 6, false, null, 21, 4, 3),
  ('PMDA_1936', 30, null, 6, true,  null, 18, 5, 3)
on conflict (code) do update set
  objection_days              = excluded.objection_days,
  notice_days                 = excluded.notice_days,
  deadline_months             = excluded.deadline_months,
  already_solemnised          = excluded.already_solemnised,
  minimum_days_after_marriage = excluded.minimum_days_after_marriage,
  minimum_age                 = excluded.minimum_age,
  display_order               = excluded.display_order,
  required_witnesses          = excluded.required_witnesses,
  updated_at                  = now();
-- MARREG-SEED-END

-- Every Act in the enum must have a rule, or submit_application() would write
-- null dates onto a real application rather than failing.
do $$
declare missing text;
begin
  select string_agg(v::text, ', ') into missing
  from unnest(enum_range(null::act_code)) v
  where v not in (select code from act_rules);
  if missing is not null then
    raise exception 'act_rules is missing a row for: %', missing;
  end if;
end $$;

-- The rules are public: the Act finder and the fee pages show them to visitors
-- who are not signed in. Nobody writes through the API — amendments arrive as
-- migrations, so there is no insert/update/delete policy at all.
alter table act_rules enable row level security;

drop policy if exists act_rules_read on act_rules;
create policy act_rules_read on act_rules for select using (true);

grant select on act_rules to anon, authenticated;

-- Supabase's default privileges hand INSERT/UPDATE/DELETE on any new table in
-- `public` to anon and authenticated. RLS above would refuse those writes for
-- want of a policy, but a grant left open next to a policy is exactly the
-- arrangement that produced the objections hole closed in migration 600.
-- Take the grants away too, so both layers say no.
revoke insert, update, delete on act_rules from anon, authenticated;

-- ------------------------------------------------------------- act_rule()
-- Was `immutable` while the values were literals. Reading a table makes it
-- `stable` — mislabelling it immutable would let the planner cache a period
-- across an amendment.
drop function if exists act_rule(act_code);

create function act_rule(a act_code)
returns table (
  objection_days int, notice_days int, deadline_months int,
  already_solemnised boolean, minimum_days_after_marriage int, minimum_age int)
language plpgsql stable as $$
begin
  -- A missing row must fail loudly. Returning nothing would leave
  -- submit_application()'s `rule` record null and quietly stamp null objection
  -- and deadline dates onto a live application.
  return query
    select r.objection_days, r.notice_days, r.deadline_months,
           r.already_solemnised, r.minimum_days_after_marriage, r.minimum_age
    from act_rules r where r.code = a;
  if not found then
    raise exception 'No rule is configured for Act %', a;
  end if;
end $$;

grant execute on function act_rule(act_code) to anon, authenticated;
