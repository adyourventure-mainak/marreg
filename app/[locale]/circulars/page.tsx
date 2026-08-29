import { Page } from "../../../components/Shell";
import { createClient } from "../../../lib/supabase/server";

export default async function CircularsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { data } = await (await createClient()).from("circulars").select("id, title, circular_date, file_url").eq("published", true).order("circular_date", { ascending: false });
  return <Page locale={locale} eyebrow="Public notices" title="Circulars" lede="Official circulars published by the registry."><div className="mt-10 grid gap-4 md:grid-cols-2">{(data ?? []).map(c => <a key={c.id} href={c.file_url} target="_blank" rel="noreferrer" className="focus border border-rule bg-surface p-6"><p className="text-xs font-bold uppercase tracking-widest text-[var(--muted)]">{c.circular_date}</p><h2 className="mt-3 text-2xl">{c.title}</h2><span className="mt-5 inline-block font-bold text-teal">Open circular →</span></a>)}{!data?.length && <p className="text-sm text-[var(--muted)]">No circulars have been published yet.</p>}</div></Page>;
}
