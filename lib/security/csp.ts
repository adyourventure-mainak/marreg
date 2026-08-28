import { SUPABASE_URL } from "../supabase/env";

/**
 * Content Security Policy.
 *
 * The site loads no third-party script, font or stylesheet — every asset comes
 * from this origin — so most of this policy can be as tight as `'self'`.
 *
 * `script-src` is the exception and the compromise. Next.js emits inline
 * bootstrap scripts carrying a nonce it generates itself; it does not adopt a
 * nonce supplied by middleware, so there is no value we can name here that
 * would match. Declaring our own nonce is worse than declaring none: it makes
 * the browser ignore `'unsafe-inline'` and blocks every one of those scripts,
 * which takes the whole site down. `'unsafe-inline'` is therefore deliberate,
 * not an oversight.
 *
 * What that leaves standing is still worth having. `script-src 'self'` means
 * no attacker-hosted script can be pulled in; `object-src 'none'` and
 * `base-uri 'self'` close the plugin and base-tag vectors; and the app renders
 * no raw HTML anywhere — there is no `dangerouslySetInnerHTML` in the
 * codebase — so React's escaping is what guards inline injection.
 *
 * `frame-ancestors 'none'` is the clickjacking control, and unlike the
 * X-Frame-Options header it is honoured by every current browser.
 */
export function contentSecurityPolicy(): string {
  // The browser Supabase client talks to the project origin directly for auth
  // and PostgREST. Nothing else is contacted from the page.
  const supabase = SUPABASE_URL ? new URL(SUPABASE_URL).origin : "";

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${supabase}`.trim(),
    // Google is here because the sign-in button submits a form that the server
    // then redirects to accounts.google.com.
    "form-action 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}
