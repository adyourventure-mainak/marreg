import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL, supabaseConfigured } from "./env";

/** Routes that require a signed-in user. Matched against the path after /<locale>. */
const PROTECTED = ["/apply", "/account", "/officer", "/admin"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!supabaseConfigured) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Do not put code between createServerClient and getUser().
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const afterLocale = path.replace(/^\/(en|bn)/, "") || "/";
  const needsAuth = PROTECTED.some((p) => afterLocale === p || afterLocale.startsWith(`${p}/`));

  if (needsAuth && !user) {
    const locale = path.startsWith("/bn") ? "bn" : "en";
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/login`;
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  return response;
}
