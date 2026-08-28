import { redirect } from "next/navigation";
import { Page } from "../../../../components/Shell";
import { Card, Empty } from "../../../../components/ui";
import { AdminNav } from "../../../../components/AdminNav";
import { createClient, getProfile } from "../../../../lib/supabase/server";
import { isAdmin, onDateTime, roleLabel } from "../../../../lib/admin";
import type { Profile } from "../../../../lib/types";

export const dynamic = "force-dynamic";

type Row = {
  id: number; application_id: string | null; entity_type: string;
  entity_id: string | null; event: string; actor_role: string | null;
  before: unknown; after: unknown; occurred_at: string;
};

const brief = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = JSON.stringify(v);
  return s.length > 140 ? `${s.slice(0, 140)}…` : s;
};

export default async function AdminAuditPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ entity?: string }>;
}) {
  const { locale } = await params;
  const { entity = "" } = await searchParams;
  const profile = (await getProfile()) as Profile | null;
  if (!profile) redirect(`/${locale}/login?next=/${locale}/admin/audit`);

  if (!isAdmin(profile)) {
    return (
      <Page locale={locale} eyebrow="Administration" title="Restricted area.">
        <Empty title="No access" body="Only the Registrar General's administrators may read the audit trail."
               action={{ href: `/${locale}`, label: "Back to the portal" }} />
      </Page>
    );
  }

  const supabase = await createClient();
  let query = supabase
    .from("audit_events")
    .select("id, application_id, entity_type, entity_id, event, actor_role, before, after, occurred_at")
    .order("occurred_at", { ascending: false })
    .limit(300);
  if (entity) query = query.eq("entity_type", entity);

  const { data } = await query;
  const rows = (data ?? []) as Row[];
  const kinds = Array.from(new Set(rows.map((r) => r.entity_type))).sort();

  return (
    <Page
      locale={locale}
      eyebrow="Administration"
      title="Audit trail."
      lede="Every decision the registry records — who made it, when, and what changed. Written by the database itself, not by the screens."
    >
      <AdminNav locale={locale} current="audit" />

      {kinds.length > 1 && (
        <form className="mt-8 flex flex-wrap items-end gap-3">
          <label className="text-sm font-bold">
            Entity
            <select name="entity" defaultValue={entity}
                    className="focus mt-2 min-h-12 w-full min-w-56 border border-rule bg-paper px-3 text-sm font-normal">
              <option value="">Everything</option>
              {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <button className="focus min-h-12 bg-saffron px-5 text-sm font-bold">Filter</button>
        </form>
      )}

      {rows.length ? (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-rule text-left text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                <th className="py-3 pr-4">When</th>
                <th className="py-3 pr-4">Event</th>
                <th className="py-3 pr-4">Entity</th>
                <th className="py-3 pr-4">By</th>
                <th className="py-3">Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--rule)] align-top">
                  <td className="py-3 pr-4 whitespace-nowrap text-[var(--muted)]">{onDateTime(r.occurred_at)}</td>
                  <td className="py-3 pr-4 font-bold">{r.event}</td>
                  <td className="py-3 pr-4 text-[var(--muted)]">
                    {r.entity_type}
                    {r.entity_id ? <span className="block text-xs">{r.entity_id}</span> : null}
                  </td>
                  <td className="py-3 pr-4 text-[var(--muted)]">{r.actor_role ? roleLabel(r.actor_role) : "—"}</td>
                  <td className="py-3 text-xs text-[var(--muted)]">
                    {brief(r.before) && <span className="block">from {brief(r.before)}</span>}
                    {brief(r.after) && <span className="block">to {brief(r.after)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Card className="mt-8">
          <p className="text-sm text-[var(--muted)]">Nothing has been recorded yet.</p>
        </Card>
      )}
    </Page>
  );
}
