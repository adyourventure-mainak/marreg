import { redirect } from "next/navigation";
import { Page } from "../../../../components/Shell";
import { AdminNav } from "../../../../components/AdminNav";
import { CircularForm } from "../../../../components/CircularForm";
import { getProfile } from "../../../../lib/supabase/server";
import { isAdmin } from "../../../../lib/admin";
import type { Profile } from "../../../../lib/types";
export default async function AdminCirculars({ params }: { params: Promise<{ locale: string }> }) { const { locale } = await params; const profile = await getProfile() as Profile | null; if (!profile) redirect(`/${locale}/login?next=/${locale}/admin/circulars`); if (!isAdmin(profile)) redirect(`/${locale}/admin`); return <Page locale={locale} eyebrow="Administration" title="Publish a circular." lede="Add an official circular so citizens can view it from the home page."><AdminNav locale={locale} current="circulars" /><CircularForm /></Page>; }
