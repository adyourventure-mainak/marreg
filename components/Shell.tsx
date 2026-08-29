import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { getProfile } from "../lib/supabase/server";
import { signOut } from "../app/actions/auth";
import type { Profile } from "../lib/types";

const STAFF_ROLES = ["MARRIAGE_OFFICER", "HINDU_REGISTRAR", "DISTRICT_REGISTRAR", "RGM_ADMIN", "SUPPORT_READONLY", "AUDITOR"];

export async function Header({ locale = "en" }: { locale?: string }) {
  const t = await getTranslations("Header");
  const profile = (await getProfile()) as Profile | null;
  const isStaff = profile ? STAFF_ROLES.includes(profile.role) : false;
  const isRgmAdmin = profile?.role === "RGM_ADMIN";

  return (
    <>
      <div className="bg-marreg-pink text-xs font-bold uppercase tracking-[.12em] text-white">
        <div className="page flex justify-between py-2">
          <span>{t("government")}</span>
          <Link className="focus" href={locale === "bn" ? "/en" : "/bn"}>
            {t("switchTo")}
          </Link>
        </div>
      </div>

      <header className="sticky top-0 z-10 border-b border-rule bg-surface">
        <nav className="page flex items-center justify-between gap-5 py-4">
          <Link href={`/${locale}`} className="focus flex shrink-0 items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-sm bg-marreg-pink font-display text-xl text-white">M</span>
            <span>
              <span className="block font-display text-2xl font-bold">MARREG</span>
              <span className="hidden text-[10px] font-bold uppercase tracking-widest text-[var(--muted)] sm:block">
                {t("organisation")}
              </span>
            </span>
          </Link>

          <div className="hidden items-center gap-6 text-sm font-semibold lg:flex">
            <Link className="focus hover:text-teal" href={`/${locale}/acts`}>{t("acts")}</Link>
            <Link className="focus hover:text-teal" href={`/${locale}/offices`}>{t("offices")}</Link>
            <Link className="focus hover:text-teal" href={`/${locale}/status`}>{t("status")}</Link>
            <Link className="focus hover:text-teal" href={`/${locale}/help`}>{t("help")}</Link>
            {isStaff && <Link className="focus text-teal hover:underline" href={`/${locale}/officer`}>{t("officerDesk")}</Link>}
            {isStaff && <Link className="focus text-teal hover:underline" href={`/${locale}/directory`}>{t("directoryReview")}</Link>}
            {isRgmAdmin && <Link className="focus text-teal hover:underline" href={`/${locale}/admin`}>{t("administration")}</Link>}
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {profile ? (
              <>
                <Link href={`/${locale}/account`} className="focus hidden text-sm font-bold text-teal sm:block">
                  {t("myApplications")}
                </Link>
                <form action={signOut}>
                  <button className="focus border border-rule px-4 py-2 text-sm font-bold text-[var(--muted)]">{t("signOut")}</button>
                </form>
              </>
            ) : (
              <>
                <Link href={`/${locale}/login`} className="focus hidden text-sm font-bold text-teal sm:block">{t("signIn")}</Link>
                <Link href={`/${locale}/apply`} className="focus border border-[var(--marreg-pink)] px-4 py-2 text-sm font-bold text-[var(--marreg-pink)]">
                  {t("applyOnline")}
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>
    </>
  );
}

export async function Footer({ locale = "en" }: { locale?: string }) {
  const t = await getTranslations("Footer");
  return (
    <footer className="mt-20 bg-marreg-pink py-12 text-white">
      <div className="page grid gap-8 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          <div className="font-display text-2xl">MARREG</div>
          <p className="mt-3 max-w-sm text-sm leading-6 text-white/80">
            {t("blurb")}
          </p>
          <Link href={`/${locale}`} className="focus mt-5 inline-block border-b border-white/70 pb-1 text-sm font-bold">
            {t("home")} <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-white/80">{t("supportLabel")}</div>
          <div className="mt-2 font-display text-2xl">{t("supportHeading")}</div>
        </div>
      </div>

      {/*
        This is a proposal build, not a live citizen service. Saying so in the
        footer of every page is the honest place for it: a reviewer can see at a
        glance that nothing here is a running government system, and no citizen
        who lands on it by accident is left thinking they have filed anything.
      */}
      <div className="page mt-8 border-t border-white/25 pt-6">
        <p className="text-xs text-white/70">{t("demo")}</p>
      </div>
    </footer>
  );
}

export async function Page({
  children, locale = "en", eyebrow, title, lede,
}: { children: ReactNode; locale?: string; eyebrow: string; title: string; lede?: string }) {
  return (
    <>
      <Header locale={locale} />
      <main className="page py-14 md:py-20">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-teal">{eyebrow}</p>
        <h1 className="mt-4 max-w-3xl text-5xl leading-[1.02] md:text-6xl">{title}</h1>
        {lede && <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--muted)]">{lede}</p>}
        {children}
      </main>
      <Footer locale={locale} />
    </>
  );
}
