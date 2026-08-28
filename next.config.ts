import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { contentSecurityPolicy } from "./lib/security/csp";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/**
 * Applied to every path, static assets included.
 */
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  // Browsers must not re-interpret an uploaded document as something else.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Belt and braces with the CSP's frame-ancestors, for anything older.
  { key: "X-Frame-Options", value: "DENY" },
  // An application URL identifies a case; it must not travel to another site.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The service asks for none of these, so refuse them rather than rely on a prompt.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Naming the framework and version only helps someone choosing an exploit.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default withNextIntl(nextConfig);
