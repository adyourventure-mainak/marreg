import { redirect } from "next/navigation";
import { Page } from "../../../../components/Shell";
import { Card, Empty } from "../../../../components/ui";
import { createClient, getProfile } from "../../../../lib/supabase/server";
import { assignStaffRole, inviteStaff, revokeStaffInvitation } from "../../../actions/admin";
import type { Office, Profile, StaffInvitation } from "../../../../lib/types";
import { AdminNav } from "../../../../components/AdminNav";
import { isAdmin } from "../../../../lib/admin";

export const dynamic = "force-dynamic";

const ROLES = ["APPLICANT", "MARRIAGE_OFFICER", "HINDU_REGISTRAR", "DISTRICT_REGISTRAR", "RGM_ADMIN", "SUPPORT_READONLY", "AUDITOR"];

/** A citizen registers themselves, so APPLICANT is never something to authorise. */
const STAFF_ROLES = ROLES.filter((r) => r !== "APPLICANT");

const label = (r: string) => r.replace(/_/g, " ").toLowerCase();
const on = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

function State({ invite }: { invite: StaffInvitation }) {
  const [text, tone] =
    invite.revoked_at  ? ["Revoked", "text-[var(--muted)]"] :
    invite.consumed_at ? ["Signed up", "text-teal"] :
                         ["Awaiting sign-up", "text-saffron"];
  return <span className={`text-xs font-bold uppercase tracking-widest ${tone}`}>{text}</span>;
}

export default async function AdminStaffPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const profile = (await getProfile()) as Profile | null;
  if (!profile) redirect(`/${locale}/login?next=/${locale}/admin/staff`);

  if (profile.role !== "RGM_ADMIN") {
    return (
      <Page locale={locale} eyebrow="Administration" title="Restricted area." lede="">
        <Empty title="No access" body="Only the Registrar General's administrators may manage staff roles." action={{ href: `/${locale}`, label: "Back to the portal" }} />
      </Page>
    );
  }

  const supabase = await createClient();
  const [{ data: users }, { data: offices }] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.from("offices").select("*").order("name"),
  ]);

  const { data: invitations } = await supabase
    .from("staff_invitations")
    .select("*")
    .order("created_at", { ascending: false });

  const officeName = (id: string | null) =>
    (offices as Office[] | null)?.find((o) => o.id === id)?.name ?? null;

  return (
    <Page
      locale={locale}
      eyebrow="Administration"
      title="Staff and roles."
      lede="Assign a registry role and an office. Staff only see applications routed to the office assigned here."
    >
      <AdminNav locale={locale} current="staff" />
      <section className="mt-10">
        <h2 className="font-display text-2xl font-bold">Authorise a staff login</h2>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          Staff and Marriage Officers cannot register themselves. Enter the official address of the
          person who will hold the login. The role below is applied the moment they sign up with that
          exact address — and to no one else.
        </p>

        <Card className="mt-5">
          <form action={inviteStaff} className="grid gap-4 md:grid-cols-[1.6fr_1fr_1fr_auto] md:items-end">
            <label className="text-sm font-bold">
              Official email address
              <input
                name="email" type="email" required autoComplete="off"
                className="focus mt-2 min-h-12 w-full border border-rule bg-paper px-3 text-sm font-normal"
              />
            </label>
            <label className="text-sm font-bold">
              Role
              <select name="role" defaultValue="MARRIAGE_OFFICER" className="focus mt-2 min-h-12 w-full border border-rule bg-paper px-3 text-sm font-normal">
                {STAFF_ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}
              </select>
            </label>
            <label className="text-sm font-bold">
              Office
              <select name="office_id" defaultValue="" className="focus mt-2 min-h-12 w-full border border-rule bg-paper px-3 text-sm font-normal">
                <option value="">No office</option>
                {(offices as Office[] | null)?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
            <button className="focus min-h-12 bg-saffron px-5 text-sm font-bold">Authorise</button>
          </form>
          <p className="mt-3 text-xs text-[var(--muted)]">
            Officer and registrar roles must name an office — it decides whose applications they see.
          </p>
        </Card>

        <h3 className="mt-10 font-display text-xl font-bold">Authorised addresses</h3>
        {(invitations as StaffInvitation[] | null)?.length ? (
          <div className="mt-4 grid gap-3">
            {(invitations as StaffInvitation[]).map((i) => (
              <Card key={i.email}>
                <div className="grid gap-4 md:grid-cols-[1.6fr_1fr_1fr_auto] md:items-center">
                  <div>
                    <p className="font-bold">{i.email}</p>
                    <p className="text-sm text-[var(--muted)]">
                      Authorised {on(i.created_at)}
                      {i.consumed_at ? ` · signed up ${on(i.consumed_at)}` : ""}
                    </p>
                  </div>
                  <p className="text-sm font-bold">{label(i.role)}</p>
                  <p className="text-sm text-[var(--muted)]">{officeName(i.office_id) ?? "No office"}</p>
                  <div className="flex items-center gap-4 md:justify-end">
                    <State invite={i} />
                    {!i.consumed_at && !i.revoked_at && (
                      <form action={revokeStaffInvitation}>
                        <input type="hidden" name="email" value={i.email} />
                        <button className="focus min-h-10 border border-rule px-4 text-sm font-bold">Revoke</button>
                      </form>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-[var(--muted)]">
            No staff logins have been authorised yet. Every officer account starts here.
          </p>
        )}
      </section>

      <h2 className="mt-14 font-display text-2xl font-bold">Existing accounts</h2>
      <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
        Roles for people who have already signed up. You cannot change your own role.
      </p>
      <div className="mt-5 grid gap-3">
        {(users as Profile[] | null)?.map((u) => (
          <Card key={u.id}>
            {u.id === profile.id ? (
              <div className="grid gap-4 md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-center">
                <div>
                  <p className="font-bold">{u.full_name ?? "No name given"}</p>
                  <p className="text-sm text-[var(--muted)]">{u.email}</p>
                </div>
                <p className="text-sm font-bold">{label(u.role)}</p>
                <p className="text-sm text-[var(--muted)]">{officeName(u.office_id) ?? "No office"}</p>
                <p className="text-xs font-bold uppercase tracking-widest text-[var(--muted)] md:text-right">
                  Your account
                </p>
              </div>
            ) : (
            <form action={assignStaffRole} className="grid gap-4 md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-end">
              <input type="hidden" name="user_id" value={u.id} />
              <div>
                <p className="font-bold">{u.full_name ?? "No name given"}</p>
                <p className="text-sm text-[var(--muted)]">{u.email}</p>
              </div>
              <label className="text-sm font-bold">
                Role
                <select name="role" defaultValue={u.role} className="focus mt-2 min-h-12 w-full border border-rule bg-paper px-3 text-sm font-normal">
                  {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ").toLowerCase()}</option>)}
                </select>
              </label>
              <label className="text-sm font-bold">
                Office
                <select name="office_id" defaultValue={u.office_id ?? ""} className="focus mt-2 min-h-12 w-full border border-rule bg-paper px-3 text-sm font-normal">
                  <option value="">No office</option>
                  {(offices as Office[] | null)?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </label>
              <button className="focus min-h-12 bg-saffron px-5 text-sm font-bold">Save</button>
            </form>
            )}
          </Card>
        ))}
      </div>
    </Page>
  );
}
