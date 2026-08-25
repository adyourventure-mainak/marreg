import { redirect } from "next/navigation";
import { Page } from "../../../components/Shell";
import { Card, Empty } from "../../../components/ui";
import { createClient, getProfile } from "../../../lib/supabase/server";
import { assignStaffRole } from "../../actions/admin";
import type { Office, Profile } from "../../../lib/types";

export const dynamic = "force-dynamic";

const ROLES = ["APPLICANT", "MARRIAGE_OFFICER", "HINDU_REGISTRAR", "DISTRICT_REGISTRAR", "RGM_ADMIN", "SUPPORT_READONLY", "AUDITOR"];

export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const profile = (await getProfile()) as Profile | null;
  if (!profile) redirect(`/${locale}/login?next=/${locale}/admin`);

  if (!["RGM_ADMIN", "DISTRICT_REGISTRAR"].includes(profile.role)) {
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

  return (
    <Page
      locale={locale}
      eyebrow="Administration"
      title="Staff and roles."
      lede="Assign a registry role and an office. Staff only see applications routed to the office assigned here."
    >
      <div className="mt-10 grid gap-3">
        {(users as Profile[] | null)?.map((u) => (
          <Card key={u.id}>
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
          </Card>
        ))}
      </div>
    </Page>
  );
}
