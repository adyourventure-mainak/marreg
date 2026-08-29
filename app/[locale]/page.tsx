import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Header, Footer } from "../../components/Shell";
import { ACT_CODES } from "../../lib/acts";
import { createClient } from "../../lib/supabase/server";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("Home");
  const ta = await getTranslations("Acts");
  const supabase = await createClient();
  const { data: circulars } = await supabase.from("circulars").select("id, title, circular_date, file_url").eq("published", true).order("circular_date", { ascending: false }).limit(5);

  const actions = [
    { key: "acts", href: `/${locale}/acts` },
    { key: "status", href: `/${locale}/status` },
    { key: "offices", href: `/${locale}/offices` },
  ] as const;

  const tiles = [
    { href: `/${locale}/apply`, kind: "service", title: "applyTitle", body: "applyBody" },
    { href: `/${locale}/status`, kind: "service", title: "statusTitle", body: "statusBody" },
    { href: `/${locale}/offices`, kind: "directory", title: "officesTitle", body: "officesBody" },
    { href: `/${locale}/help`, kind: "publicInformation", title: "helpTitle", body: "helpBody" },
  ] as const;

  return (
    <main>
      <Header locale={locale} />

      <section className="border-b border-rule bg-surface">
        <div className="page py-8">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-teal">Citizen services</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              ["Track application", "Check your application status and next step.", `/${locale}/status`],
              ["Transfer of Marriage Officer", "Request a change of Marriage Officer with a reason.", `/${locale}/transfer-mo`],
              ["File an objection", "Submit an objection against a published notice.", `/${locale}/objections`],
            ].map(([title, body, href]) => <Link key={href} href={href} className="focus border border-rule bg-paper p-4 transition hover:border-teal">
              <h2 className="text-xl">{title}</h2><p className="mt-2 text-sm text-[var(--muted)]">{body}</p><span className="mt-3 inline-block text-sm font-bold text-teal">Open service →</span>
            </Link>)}
          </div>
        </div>
      </section>

      <section className="page grid gap-12 py-16 md:grid-cols-[1.05fr_.95fr] md:items-center md:py-24">
        <div>
          <p className="mb-5 text-xs font-bold uppercase tracking-[.18em] text-teal">{t("eyebrow")}</p>
          <h1 className="max-w-xl text-5xl leading-[.98] md:text-7xl">{t("title")}</h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--muted)]">{t("lede")}</p>

          <Link
            href={`/${locale}/help/ask`}
            className="focus mt-7 inline-flex min-h-12 items-center border border-teal px-5 text-sm font-bold text-teal transition hover:bg-saffron-tint"
          >
            {t("askAssistant")} <span className="ml-2" aria-hidden="true">↓</span>
          </Link>

          <div id="act-finder" className="mt-9 border border-rule bg-surface p-5 shadow-[0_12px_28px_rgba(23,33,31,.08)]">
            <label htmlFor="act" className="mb-2 block text-sm font-bold">{t("finderLabel")}</label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <select id="act" className="focus min-h-12 flex-1 border border-rule bg-paper px-4 text-sm">
                <option>{t("finderPlaceholder")}</option>
                {ACT_CODES.map((code) => (
                  <option key={code} value={code}>{ta(`rules.${code}.label`)}</option>
                ))}
              </select>
              <Link href={`/${locale}/acts`} className="focus inline-flex min-h-12 items-center justify-center bg-saffron px-5 text-sm font-bold">
                {t("finderSubmit")}
              </Link>
            </div>
            <p className="mt-3 text-xs text-[var(--muted)]">{t("finderNote")}</p>
          </div>
        </div>

        <div className="ledger relative min-h-[390px] overflow-hidden p-7 md:p-10">
          <div className="absolute right-6 top-6 rounded-full border border-saffron bg-saffron-tint px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-teal">
            {t("badge")}
          </div>
          <div className="mt-12 max-w-sm">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-[var(--muted)]">{t("ledgerEyebrow")}</p>
            <h2 className="mt-5 text-4xl leading-tight">{t("ledgerHeading")}</h2>
            <p className="mt-5 text-sm leading-7 text-[var(--muted)]">{t("ledgerBody")}</p>
          </div>
          <div className="absolute bottom-10 left-10 right-10 border-b-2 border-ink pb-3 font-display text-2xl italic">
            {t("ledgerCaption")}
          </div>
        </div>
      </section>

      <section className="border-y border-rule bg-surface">
        <div className="page grid gap-0 md:grid-cols-3">
          {actions.map((a, i) => (
            <article key={a.key} className="border-rule py-8 md:border-r md:px-8 md:first:pl-0 md:last:border-0 md:last:pr-0">
              <span className="font-display text-3xl text-saffron">0{i + 1}</span>
              <h2 className="mt-4 text-2xl">{t(`actions.${a.key}.title`)}</h2>
              <p className="mt-3 min-h-16 text-sm leading-6 text-[var(--muted)]">{t(`actions.${a.key}.body`)}</p>
              <Link className="focus mt-5 inline-block border-b-2 border-saffron pb-1 text-sm font-bold text-teal" href={a.href}>
                {t(`actions.${a.key}.label`)} <span aria-hidden="true">→</span>
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-rule bg-surface">
        <div className="page py-14">
          <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-teal">Public notices</p><h2 className="mt-3 text-4xl">Circulars</h2></div><Link className="font-bold text-teal underline" href={`/${locale}/circulars`}>View all →</Link></div>
          <div className="mt-8 grid gap-3 md:grid-cols-2">
            {(circulars ?? []).map((c) => <a key={c.id} href={c.file_url} target="_blank" rel="noreferrer" className="focus border border-rule p-5"><p className="text-xs font-bold uppercase tracking-widest text-[var(--muted)]">{c.circular_date}</p><h3 className="mt-2 text-xl">{c.title}</h3><span className="mt-3 inline-block text-sm font-bold text-teal">Open circular →</span></a>)}
            {!circulars?.length && <p className="text-sm text-[var(--muted)]">New circulars will appear here when published by the administration.</p>}
          </div>
        </div>
      </section>

      <section id="requirements" className="page grid gap-10 py-16 md:grid-cols-[1fr_1.2fr] md:py-24">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-teal">{t("trustEyebrow")}</p>
          <h2 className="mt-4 text-4xl">{t("trustHeading")}</h2>
        </div>
        <div className="space-y-5 text-sm leading-7 text-[var(--muted)]">
          <p>{t("trustBody")}</p>
          <div className="flex gap-4 border-l-2 border-saffron pl-5">
            <span className="font-display text-2xl text-teal">✓</span>
            <p>
              <strong className="text-ink">{t("trustPointTitle")}</strong>
              <br />
              {t("trustPointBody")}
            </p>
          </div>
        </div>
      </section>

      <section className="border-y border-rule bg-surface">
        <div className="page grid gap-4 py-12 md:grid-cols-4">
          {tiles.map((tile) => (
            <Link key={tile.title} href={tile.href} className="focus border border-rule p-5">
              <span className="text-xs font-bold uppercase tracking-widest text-teal">{t(`tiles.${tile.kind}`)}</span>
              <h2 className="mt-3 text-2xl">{t(`tiles.${tile.title}`)}</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">{t(`tiles.${tile.body}`)}</p>
            </Link>
          ))}
        </div>
      </section>

      <Footer locale={locale} />
    </main>
  );
}
