import { SUPABASE_URL } from "../supabase/env";

/**
 * Content Security Policy.
 *
 * The site runs no third-party script, so `script-src` names no other origin.
 * It does load its two typefaces from Google Fonts (`app/globals.css`), which
 * is a stylesheet on one host pulling font files from a second, so both hosts
 * have to be named or the page renders in a fallback face.
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
  // and PostgREST, and the Google sign-in form is redirected through it.
  const supabase = SUPABASE_URL ? new URL(SUPABASE_URL).origin : "";

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob:",
    "font-src 'self' https://fonts.gstatic.com",
    `connect-src 'self' ${supabase}`.trim(),
    // `form-action` is enforced across the whole redirect chain a submission
    // follows, not just its first hop. Google sign-in posts to this origin,
    // which redirects to the Supabase authorize endpoint, which redirects to
    // Google — so every one of the three has to be listed. Omitting the
    // Supabase origin silently blocks the button with no server-side trace:
    // the endpoint still answers 303 with a valid URL and the browser refuses
    // to follow it.
    `form-action 'self' ${supabase} https://accounts.google.com`.replace(/\s+/g, " "),
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}
