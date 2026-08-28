import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../lib/supabase/server";

/** Handles email confirmation, password-reset links, and the Google OAuth return. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next") ?? "/en/account";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") && !requestedNext.includes("\\")
    ? requestedNext
    : "/en/account";
  const errorDescription = searchParams.get("error_description");

  if (errorDescription) {
    return NextResponse.redirect(`${origin}/en/login?error=${encodeURIComponent(errorDescription)}`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);

    // The verifier is a cookie on the origin that began the flow, so it is
    // missing when the link is opened in another browser or after the cookie
    // has been cleared. The citizen needs an instruction, not the raw fault.
    const message = /code (challenge|verifier)/i.test(error.message)
      ? "This link could not be opened in this browser. Please request a new link and open it in the same browser you started in."
      : error.message;
    return NextResponse.redirect(`${origin}/en/login?error=${encodeURIComponent(message)}`);
  }

  return NextResponse.redirect(`${origin}/en/login?error=Missing%20confirmation%20code`);
}
