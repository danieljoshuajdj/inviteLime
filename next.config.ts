import type { NextConfig } from "next";

/** Supabase storage host used for template + customer media. */
function supabaseHost(): string | undefined {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return url ? new URL(url).hostname : undefined;
  } catch {
    return undefined;
  }
}

const host = supabaseHost();
const supabaseOrigin = host ? `https://${host}` : "";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(self), browsing-topics=()",
  },
  // Invitation pages are rendered by the platform, never framed by others.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
];

// Opt-in CSP (set ENABLE_CSP=1). Off by default so the policy can be verified
// per environment before it is enforced. The invitation runtime renders
// uploaded template packages inside a srcDoc iframe, so script/style/img/media
// sources must include object storage.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  `img-src 'self' data: blob: https://*.supabase.co ${supabaseOrigin}`.trim(),
  `media-src 'self' data: blob: https://*.supabase.co ${supabaseOrigin}`.trim(),
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  `script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://*.supabase.co ${supabaseOrigin}`.trim(),
  `connect-src 'self' ${supabaseOrigin} https://*.supabase.co https://api.razorpay.com https://lumberjack.razorpay.com`.trim(),
  "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
  "form-action 'self' https://checkout.razorpay.com",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    remotePatterns: host
      ? [{ protocol: "https", hostname: host, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
  async headers() {
    const headers = [...securityHeaders];
    if (process.env.ENABLE_CSP === "1") {
      headers.push({ key: "Content-Security-Policy", value: csp });
    }
    return [{ source: "/(.*)", headers }];
  },
};

export default nextConfig;
